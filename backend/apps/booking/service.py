"""Making, moving and answering bookings. Every change takes the settings row lock first."""

from datetime import date, datetime, time, timedelta
from typing import Any

from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from apps.audit.service import record
from apps.core.privacy import ip_digest
from apps.inquiries.models import Inquiry, InquiryStatusChange

from .messages import t
from .models import Booking, BookingSettings, ClosedPeriod, SessionType, WorkingHours
from .slots import Busy, Rules, at, free_times, overlaps

MAX_RANGE_DAYS = 62


class BookingError(Exception):
    def __init__(self, code: str, status: int = 409, detail: str | None = None) -> None:
        super().__init__(code)
        self.code = code
        self.status = status
        self.custom_detail = detail

    def detail_for(self, language: str) -> str:
        return self.custom_detail or t(self.code, language)


def _rules(settings: BookingSettings) -> Rules:
    hours: dict[int, list[tuple[time, time]]] = {}
    for row in WorkingHours.objects.all():
        hours.setdefault(row.weekday, []).append((row.start, row.end))
    closed = [(c.start_date, c.end_date) for c in ClosedPeriod.objects.all()]
    return Rules(
        hours=hours,
        closed=closed,
        max_per_day=settings.max_per_day,
        min_notice=timedelta(hours=settings.min_notice_hours),
        horizon_days=settings.horizon_days,
    )


def _busy(first: date, last: date, exclude: int | None = None) -> list[Busy]:
    """Active bookings that touch the days from `first` to `last` (a day either side, for the buffer)."""
    window_start = at(first - timedelta(days=1), time(0))
    window_end = at(last + timedelta(days=2), time(0))
    qs = Booking.objects.filter(
        status__in=[Booking.Status.PENDING, Booking.Status.CONFIRMED],
        start_at__lt=window_end,
        blocked_until__gt=window_start,
    )
    if exclude is not None:
        qs = qs.exclude(pk=exclude)
    return [Busy(b.start_at, b.blocked_until) for b in qs]


def availability(
    session_type: SessionType, first: date, last: date, now: datetime | None = None
) -> dict[date, list[time]]:
    """Free start times for each day from `first` to `last` (days without any are left out)."""
    if (last - first).days >= MAX_RANGE_DAYS or last < first:
        raise BookingError("range_too_long", 400)
    now = now or timezone.now()
    rules = _rules(BookingSettings.load())
    busy = _busy(first, last)
    duration = timedelta(minutes=session_type.duration_minutes)
    buffer = timedelta(minutes=session_type.buffer_minutes)
    result: dict[date, list[time]] = {}
    day = first
    while day <= last:
        times = free_times(day, duration=duration, buffer=buffer, rules=rules, busy=busy, now=now)
        if times:
            result[day] = times
        day += timedelta(days=1)
    return result


def _lock() -> BookingSettings:
    BookingSettings.load()  # make sure the row exists
    return BookingSettings.objects.select_for_update().get(pk=1)


def _convert_inquiry(booking: Booking, request: HttpRequest) -> None:
    inquiry = booking.inquiry
    if inquiry is None or inquiry.status in (Inquiry.Status.CONVERTED, Inquiry.Status.CLOSED):
        return
    before = inquiry.status
    inquiry.status = Inquiry.Status.CONVERTED
    if inquiry.seen_at is None:
        inquiry.seen_at = timezone.now()
    inquiry.save(update_fields=["status", "seen_at", "updated_at"])
    user = getattr(request, "user", None)
    InquiryStatusChange.objects.create(
        inquiry=inquiry,
        from_status=before,
        to_status=inquiry.status,
        changed_by=user if user is not None and user.is_authenticated else None,
    )


def create_booking(
    data: dict[str, Any],
    request: HttpRequest,
    *,
    admin: bool = False,
    now: datetime | None = None,
) -> Booking:
    """`data` has `session_type` (an object), `date`, `time` and the customer's details.

    The public may only take a time the engine offers; the owner may go outside the hours, the notice and
    the daily limit, but never over another booking.
    """
    now = now or timezone.now()
    with transaction.atomic():
        settings = _lock()
        stype: SessionType = data["session_type"]
        if not admin and not stype.is_active:
            raise BookingError("type_unavailable", 400)
        day: date = data["date"]
        clock: time = data["time"]
        duration = timedelta(minutes=stype.duration_minutes)
        buffer = timedelta(minutes=stype.buffer_minutes)
        start = at(day, clock)
        busy = _busy(day, day)
        if admin:
            if overlaps(start, start + duration + buffer, busy):
                raise BookingError("slot_taken")
        else:
            offered = free_times(day, duration=duration, buffer=buffer, rules=_rules(settings), busy=busy, now=now)
            if clock not in offered:
                raise BookingError("slot_taken")
        language = data.get("language", "fa")
        package = data.get("package")
        booking = Booking.objects.create(
            status=data.get("status", Booking.Status.PENDING),
            language=language,
            session_type=stype,
            session_label=stype.title(language),
            start_at=start,
            end_at=start + duration,
            blocked_until=start + duration + buffer,
            name=data["name"],
            brand=data.get("brand", ""),
            phone=data.get("phone", ""),
            whatsapp=data.get("whatsapp", ""),
            telegram=data.get("telegram", ""),
            email=data.get("email", ""),
            notes=data.get("notes", ""),
            package=package,
            package_label=((package.title_en or package.title_fa) if language == "en" else package.title_fa)
            if package
            else "",
            inquiry=data.get("inquiry"),
            proforma=data.get("proforma"),
            created_by_admin=admin,
            seen_at=now if admin else None,
            ip_hash="" if admin else ip_digest(request, "booking"),
        )
        if booking.status == Booking.Status.CONFIRMED:
            _convert_inquiry(booking, request)
        record(
            "booking.booking.create",
            request=request,
            target=booking,
            by="admin" if admin else "customer",
            status=booking.status,
        )
    return booking


def reschedule(
    booking_id: int, day: date, clock: time, request: HttpRequest, *, now: datetime | None = None
) -> Booking:
    with transaction.atomic():
        _lock()
        booking = Booking.objects.select_for_update().get(pk=booking_id)
        if not booking.is_active:
            raise BookingError("not_movable", 409, "فقط رزرو در انتظار یا تأییدشده را می‌توان جابه‌جا کرد.")
        length = booking.end_at - booking.start_at
        buffer = booking.blocked_until - booking.end_at
        start = at(day, clock)
        if overlaps(start, start + length + buffer, _busy(day, day, exclude=booking.pk)):
            raise BookingError("slot_taken")
        booking.start_at, booking.end_at, booking.blocked_until = start, start + length, start + length + buffer
        booking.save(update_fields=["start_at", "end_at", "blocked_until", "updated_at"])
        record("booking.booking.reschedule", request=request, target=booking)
    return booking


def _move(
    booking_id: int,
    request: HttpRequest,
    *,
    allowed: tuple[str, ...],
    to: str,
    code: str,
    detail: str,
    action: str,
    **fields: Any,
) -> Booking:
    with transaction.atomic():
        _lock()
        booking = Booking.objects.select_for_update().get(pk=booking_id)
        if booking.status == to:
            return booking  # asking again for what already happened changes nothing
        if booking.status not in allowed:
            raise BookingError(code, 409, detail)
        booking.status = to
        for key, value in fields.items():
            setattr(booking, key, value)
        if booking.seen_at is None:
            booking.seen_at = timezone.now()
        booking.save()
        record(f"booking.booking.{action}", request=request, target=booking)
    return booking


def confirm(booking_id: int, request: HttpRequest, *, now: datetime | None = None) -> Booking:
    booking = Booking.objects.get(pk=booking_id)
    if booking.status == Booking.Status.PENDING and booking.start_at <= (now or timezone.now()):
        raise BookingError("in_past", 409, "زمان این رزرو گذشته است؛ تأیید ممکن نیست.")
    done = _move(
        booking_id, request, allowed=(Booking.Status.PENDING,), to=Booking.Status.CONFIRMED,
        code="not_confirmable", detail="فقط رزرو در انتظار را می‌توان تأیید کرد.", action="confirm",
    )  # fmt: skip
    _convert_inquiry(done, request)
    return done


def complete(booking_id: int, request: HttpRequest, *, now: datetime | None = None) -> Booking:
    booking = Booking.objects.get(pk=booking_id)
    if booking.status == Booking.Status.CONFIRMED and booking.start_at > (now or timezone.now()):
        raise BookingError("not_started", 409, "این رزرو هنوز شروع نشده است.")
    return _move(
        booking_id, request, allowed=(Booking.Status.CONFIRMED,), to=Booking.Status.COMPLETED,
        code="not_completable", detail="فقط رزرو تأییدشده را می‌توان انجام‌شده کرد.", action="complete",
    )  # fmt: skip


def cancel(booking_id: int, request: HttpRequest, reason: str = "") -> Booking:
    """The owner cancels or rejects. Asking again is harmless."""
    return _move(
        booking_id, request, allowed=(Booking.Status.PENDING, Booking.Status.CONFIRMED), to=Booking.Status.CANCELLED,
        code="not_cancellable", detail="این رزرو را نمی‌توان لغو کرد.", action="cancel",
        cancelled_by=Booking.CancelledBy.ADMIN, cancel_reason=reason[:300],
    )  # fmt: skip


def customer_cancel(booking: Booking, request: HttpRequest, *, now: datetime | None = None) -> Booking:
    if booking.status == Booking.Status.CANCELLED and booking.cancelled_by == Booking.CancelledBy.CUSTOMER:
        return booking
    if booking.is_active and booking.start_at <= (now or timezone.now()):
        raise BookingError("too_late")
    try:
        return _move(
            booking.pk, request, allowed=(Booking.Status.PENDING, Booking.Status.CONFIRMED),
            to=Booking.Status.CANCELLED, code="not_cancellable", detail="", action="customer_cancel",
            cancelled_by=Booking.CancelledBy.CUSTOMER,
        )  # fmt: skip
    except BookingError as error:
        if error.code == "not_cancellable":
            raise BookingError("not_cancellable") from error  # message in the customer's language
        raise


def pending_count() -> int:
    return Booking.objects.filter(status=Booking.Status.PENDING, start_at__gt=timezone.now()).count()
