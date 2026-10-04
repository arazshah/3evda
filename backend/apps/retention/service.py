"""The data-retention rules, in one place so that "what will be removed" and "remove it" cannot disagree.

* Enquiries and bookings older than the limit are **anonymised**: name, contact details, free text and the
  visitor's hashed address are cleared; what statistics need (status, dates, estimate, service) stays.
* Galleries that expired (or were archived) longer ago than the limit are **deleted** with all their files.
* Issued proformas are never deleted and nothing financial on them changes; after their own, longer limit only
  the customer's personal details on them are anonymised. (Their PDF is drawn from the database on request,
  so no stored copy needs removing.)

Every step looks only at rows not yet processed, so running it twice does nothing the second time.
"""

import calendar
import logging
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Min, Q, QuerySet
from django.utils import timezone

from apps.audit.service import record
from apps.booking.models import Booking
from apps.galleries.models import Gallery
from apps.galleries.service import delete_gallery
from apps.galleries.tasks import delete_files
from apps.inquiries.models import Inquiry
from apps.proformas.models import Proforma

from .models import RetentionSettings

logger = logging.getLogger(__name__)

ANONYMOUS = "ناشناس"


def months_ago(now: datetime, months: int) -> datetime:
    index = now.year * 12 + (now.month - 1) - months
    year, month = divmod(index, 12)
    day = min(now.day, calendar.monthrange(year, month + 1)[1])
    return now.replace(year=year, month=month + 1, day=day)


@dataclass(frozen=True)
class Rule:
    key: str
    label: str
    action: str  # "anonymise" or "delete"
    queryset: Callable[[RetentionSettings, datetime], QuerySet[Any]]
    date_field: str


def _inquiries(s: RetentionSettings, now: datetime) -> QuerySet[Inquiry]:
    return Inquiry.objects.filter(anonymized_at__isnull=True, created_at__lt=months_ago(now, s.inquiry_months))


def _bookings(s: RetentionSettings, now: datetime) -> QuerySet[Booking]:
    return Booking.objects.filter(anonymized_at__isnull=True, end_at__lt=months_ago(now, s.booking_months))


def _galleries(s: RetentionSettings, now: datetime) -> QuerySet[Gallery]:
    cutoff = now - timedelta(days=s.gallery_days)
    return Gallery.objects.filter(Q(expires_at__lt=cutoff) | Q(status=Gallery.Status.ARCHIVED, updated_at__lt=cutoff))


def _proformas(s: RetentionSettings, now: datetime) -> QuerySet[Proforma]:
    cutoff = months_ago(now, s.proforma_months)
    return Proforma.objects.filter(anonymized_at__isnull=True).filter(
        Q(issued_at__lt=cutoff) | Q(issued_at__isnull=True, created_at__lt=cutoff)
    )


RULES = [
    Rule("inquiries", "استعلام‌ها (ناشناس‌سازی)", "anonymise", _inquiries, "created_at"),
    Rule("bookings", "رزروها (ناشناس‌سازی)", "anonymise", _bookings, "end_at"),
    Rule("galleries", "گالری‌های منقضی یا بایگانی‌شده (حذف کامل با فایل‌ها)", "delete", _galleries, "expires_at"),
    Rule(
        "proformas",
        "اطلاعات شخصی مشتری روی پیش‌فاکتورها (ناشناس‌سازی؛ بخش مالی دست‌نخورده)",
        "anonymise",
        _proformas,
        "created_at",
    ),
]


def preview(now: datetime | None = None, settings: RetentionSettings | None = None) -> list[dict[str, Any]]:
    """What a run would do now. Changes nothing. Dates only: no personal detail leaves this function."""
    now = now or timezone.now()
    s = settings or RetentionSettings.load()
    rows = []
    for rule in RULES:
        qs = rule.queryset(s, now)
        oldest = qs.aggregate(m=Min(rule.date_field))["m"]
        rows.append(
            {"key": rule.key, "label": rule.label, "action": rule.action, "count": qs.count(), "oldest": oldest}
        )
    return rows


# ---- the steps ------------------------------------------------------------------------------------------


def _forget_files(keys: list[str]) -> None:
    keys = [k for k in keys if k]
    if keys:
        transaction.on_commit(lambda: delete_files.apply_async(args=[keys], queue="galleries"))


def anonymise_inquiry(inquiry: Inquiry, now: datetime) -> bool:
    with transaction.atomic():
        changed = Inquiry.objects.filter(pk=inquiry.pk, anonymized_at__isnull=True).update(
            name=ANONYMOUS,
            brand="",
            phone="",
            whatsapp="",
            telegram="",
            email="",
            message="",
            internal_note="",
            ip_hash="",
            anonymized_at=now,
        )
        if not changed:
            return False
        keys = list(inquiry.attachments.values_list("key", flat=True))
        inquiry.attachments.all().delete()
        _forget_files(keys)
    return True


def anonymise_booking(booking: Booking, now: datetime) -> bool:
    with transaction.atomic():
        return bool(
            Booking.objects.filter(pk=booking.pk, anonymized_at__isnull=True).update(
                name=ANONYMOUS,
                brand="",
                phone="",
                whatsapp="",
                telegram="",
                email="",
                notes="",
                internal_note="",
                cancel_reason="",
                ip_hash="",
                anonymized_at=now,
            )
        )


def anonymise_proforma(proforma: Proforma, now: datetime) -> bool:
    """Personal details only. Number, items, amounts, dates, status and terms are not touched."""
    with transaction.atomic():
        return bool(
            Proforma.objects.filter(pk=proforma.pk, anonymized_at__isnull=True).update(
                customer_name=ANONYMOUS,
                customer_company="",
                customer_contact="",
                response_ip_hash="",
                response_user_agent="",
                rejection_reason="",
                anonymized_at=now,
            )
        )


def _remove_gallery(gallery: Gallery, now: datetime) -> bool:
    delete_gallery(gallery)
    return True


STEPS: dict[str, Callable[[Any, datetime], bool]] = {
    "inquiries": anonymise_inquiry,
    "bookings": anonymise_booking,
    "galleries": _remove_gallery,
    "proformas": anonymise_proforma,
}


def run(*, now: datetime | None = None, request: Any = None, trigger: str = "scheduled") -> dict[str, Any]:
    """Apply the rules. A switched-off policy does nothing at all."""
    now = now or timezone.now()
    s = RetentionSettings.load()
    counts: dict[str, int] = {rule.key: 0 for rule in RULES}
    if s.enabled:
        for rule in RULES:
            step = STEPS[rule.key]
            for obj in list(rule.queryset(s, now).order_by("pk")):
                try:
                    if step(obj, now):
                        counts[rule.key] += 1
                except Exception:
                    logger.exception("retention step failed", extra={"rule": rule.key, "id": obj.pk})
    summary = {"enabled": s.enabled, "trigger": trigger, "counts": counts}
    RetentionSettings.objects.filter(pk=s.pk).update(last_run_at=now, last_run=summary)
    record("retention.run", request=request, enabled=s.enabled, trigger=trigger, counts=counts)
    return summary
