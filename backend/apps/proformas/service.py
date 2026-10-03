"""What can happen to a proforma, with the rules that keep issued ones trustworthy."""

from datetime import date, timedelta
from decimal import Decimal
from typing import Any

import jdatetime
from django.db import transaction
from django.http import HttpRequest
from django.utils import timezone

from apps.audit.service import record
from apps.core.money import round_half_up
from apps.core.privacy import ip_digest
from apps.inquiries.models import Inquiry, InquiryStatusChange

from .links import public_url
from .models import Proforma, ProformaCounter, ProformaItem, ProformaSettings
from .totals import compute_totals

EXPIRED = "expired"  # shown, never stored: it follows from the date


class ProformaError(Exception):
    def __init__(self, code: str, detail: str, status: int = 409) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status = status


def effective_status(proforma: Proforma, today: date | None = None) -> str:
    """The stored status, except that a proforma nobody answered before its date is «expired»."""
    pending = proforma.status in (Proforma.Status.SENT, Proforma.Status.VIEWED)
    if pending and proforma.valid_until and proforma.valid_until < (today or timezone.localdate()):
        return EXPIRED
    return str(proforma.status)


def jalali_year(day: date) -> int:
    return int(jdatetime.date.fromgregorian(date=day).year)


def recalculate(proforma: Proforma) -> Proforma:
    totals = compute_totals(
        ((item.quantity, item.unit_price) for item in proforma.items.all()),
        discount_amount=proforma.discount_amount,
        discount_percent=proforma.discount_percent,
        tax_percent=proforma.tax_percent,
    )
    proforma.subtotal, proforma.discount, proforma.tax, proforma.total = (
        totals.subtotal,
        totals.discount,
        totals.tax,
        totals.total,
    )
    proforma.save(update_fields=["subtotal", "discount", "tax", "total", "updated_at"])
    return proforma


def draft_defaults(language: str, today: date | None = None) -> dict[str, Any]:
    """What a new draft starts from: the owner's standard terms, tax and validity."""
    settings = ProformaSettings.load()
    today = today or timezone.localdate()
    terms = (settings.terms_en if language == "en" else settings.terms_fa) or settings.terms_fa or settings.terms_en
    return {
        "terms": terms,
        "tax_percent": settings.default_tax_percent,
        "valid_until": today + timedelta(days=settings.default_validity_days),
    }


def _issuer(language: str) -> dict[str, str]:
    s = ProformaSettings.load()

    def pick(fa: str, en: str) -> str:
        return (en or fa) if language == "en" else (fa or en)

    return {
        "name": pick(s.issuer_name_fa, s.issuer_name_en),
        "phone": s.phone,
        "address": pick(s.address_fa, s.address_en),
        "footer": pick(s.footer_fa, s.footer_en),
    }


# ---- making and issuing ----------------------------------------------------------------------------


def from_inquiry(inquiry: Inquiry, language: str | None = None) -> Proforma:
    """A draft prefilled from an enquiry: the customer, and one line priced from the middle of the range shown."""
    language = language or inquiry.language or "fa"
    with transaction.atomic():
        proforma = Proforma.objects.create(
            language=language,
            customer_name=inquiry.name,
            customer_company=inquiry.brand,
            customer_contact=inquiry.phone or inquiry.whatsapp or inquiry.telegram or inquiry.email,
            inquiry=inquiry,
            **draft_defaults(language),
        )
        if inquiry.service_label and inquiry.quantity and inquiry.estimate_low is not None:
            middle = round_half_up(Decimal(inquiry.estimate_low + (inquiry.estimate_high or inquiry.estimate_low)) / 2)
            options = inquiry.options if isinstance(inquiry.options, dict) else {}
            extras = [c.get("label", "") for key in ("addons", "multipliers") for c in options.get(key, [])]
            ProformaItem.objects.create(
                proforma=proforma,
                description=" · ".join([inquiry.service_label, *[e for e in extras if e]])[:200],
                quantity=inquiry.quantity,
                unit_price=round_half_up(Decimal(middle) / inquiry.quantity),
            )
        recalculate(proforma)
    return proforma


def _next_number(year: int) -> int:
    ProformaCounter.objects.get_or_create(year=year)  # safe when two requests create the year at once
    counter = ProformaCounter.objects.select_for_update().get(year=year)
    counter.last_number += 1
    counter.save(update_fields=["last_number"])
    return counter.last_number


def issue(proforma_id: int, request: HttpRequest) -> Proforma:
    """Give a draft its number, freeze it and make its link usable; a revision supersedes its predecessor.

    The number is taken last, under the lock on that year's counter, so two proformas issued at the same
    moment get different, consecutive numbers and a failure anywhere above leaves no gap.
    """
    with transaction.atomic():
        proforma = Proforma.objects.select_for_update().get(pk=proforma_id)
        if proforma.status != Proforma.Status.DRAFT:
            raise ProformaError("not_draft", "فقط پیش‌نویس را می‌توان صادر کرد.")
        today = timezone.localdate()
        problems = {}
        if not proforma.customer_name.strip():
            problems["customer_name"] = "نام مشتری را وارد کنید."
        if not proforma.items.exists():
            problems["items"] = "دست‌کم یک آیتم لازم است."
        if proforma.valid_until is None or proforma.valid_until < today:
            problems["valid_until"] = "تاریخ اعتبار باید امروز یا بعد از آن باشد."
        if problems:
            raise ProformaError("incomplete", " ".join(problems.values()), 400)

        predecessor = None
        if proforma.replaces_id:
            predecessor = Proforma.objects.select_for_update().get(pk=proforma.replaces_id)
            if predecessor.status == Proforma.Status.APPROVED:
                raise ProformaError("replaced_is_approved", "نسخه‌ی قبلی تأیید شده است و جایگزین نمی‌شود.")

        recalculate(proforma)
        year = jalali_year(today)
        proforma.number = f"3E-{year}-{_next_number(year):04d}"
        proforma.status = Proforma.Status.SENT
        proforma.issue_date = today
        proforma.issued_at = timezone.now()
        proforma.issuer = _issuer(proforma.language)
        proforma.save()

        if predecessor and predecessor.status in (Proforma.Status.SENT, Proforma.Status.VIEWED):
            predecessor.status = Proforma.Status.SUPERSEDED
            predecessor.save(update_fields=["status", "updated_at"])

        inquiry = proforma.inquiry
        if inquiry and inquiry.status in (Inquiry.Status.NEW, Inquiry.Status.REVIEWING):
            before = inquiry.status
            inquiry.status = Inquiry.Status.PROFORMA_SENT
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
        record("proformas.proforma.issue", request=request, target=proforma, number=proforma.number)
    return proforma


def revise(proforma: Proforma, request: HttpRequest) -> Proforma:
    """A draft for a corrected version. The proforma it corrects stays as it is until the draft is issued."""
    if effective_status(proforma) not in (
        Proforma.Status.SENT,
        Proforma.Status.VIEWED,
        Proforma.Status.REJECTED,
        EXPIRED,
    ):
        raise ProformaError("not_revisable", "این پیش‌فاکتور را نمی‌توان اصلاح کرد.")
    with transaction.atomic():
        existing = proforma.replaced_by.filter(status=Proforma.Status.DRAFT).first()
        if existing:
            return existing  # one open revision at a time
        draft = Proforma.objects.create(
            language=proforma.language,
            customer_name=proforma.customer_name,
            customer_company=proforma.customer_company,
            customer_contact=proforma.customer_contact,
            inquiry=proforma.inquiry,
            replaces=proforma,
            discount_amount=proforma.discount_amount,
            discount_percent=proforma.discount_percent,
            tax_percent=proforma.tax_percent,
            terms=proforma.terms,
            valid_until=draft_defaults(proforma.language)["valid_until"],
        )
        ProformaItem.objects.bulk_create(
            ProformaItem(
                proforma=draft,
                description=item.description,
                quantity=item.quantity,
                unit_price=item.unit_price,
                position=item.position,
            )
            for item in proforma.items.all()
        )
        recalculate(draft)
        record("proformas.proforma.revise", request=request, target=draft, replaces=proforma.number)
    return draft


def new_link(proforma: Proforma, request: HttpRequest) -> Proforma:
    """Cancel the link given out so far and make another (the old one stops working at once)."""
    if proforma.status == Proforma.Status.DRAFT:
        raise ProformaError("not_issued", "پیش‌نویس هنوز لینک ندارد.")
    proforma.link_version += 1
    proforma.save(update_fields=["link_version", "updated_at"])
    record("proformas.proforma.new_link", request=request, target=proforma)
    return proforma


def cancel(proforma: Proforma, request: HttpRequest) -> Proforma:
    with transaction.atomic():
        locked = Proforma.objects.select_for_update().get(pk=proforma.pk)
        if locked.status not in (Proforma.Status.SENT, Proforma.Status.VIEWED):
            raise ProformaError("not_cancellable", "فقط پیش‌فاکتور ارسال‌شده یا دیده‌شده را می‌توان لغو کرد.")
        locked.status = Proforma.Status.CANCELLED
        locked.save(update_fields=["status", "updated_at"])
        record("proformas.proforma.cancel", request=request, target=locked)
    return locked


# ---- the customer's side ---------------------------------------------------------------------------

_BLOCKED = {
    Proforma.Status.SUPERSEDED: ("superseded", "نسخه‌ی جدیدتری از این پیش‌فاکتور صادر شده است."),
    Proforma.Status.CANCELLED: ("cancelled", "این پیش‌فاکتور لغو شده است."),
}


def mark_seen(proforma: Proforma) -> None:
    """Sent → viewed, once. Only called by the page after it has loaded in a browser, never by a plain GET."""
    Proforma.objects.filter(pk=proforma.pk, status=Proforma.Status.SENT).update(
        status=Proforma.Status.VIEWED, seen_at=timezone.now()
    )


def _answer(proforma_id: int, request: HttpRequest, outcome: Proforma.Status, reason: str = "") -> Proforma:
    """Approve or reject, once. Repeating the same answer changes nothing; the opposite answer is refused."""
    opposite = Proforma.Status.REJECTED if outcome == Proforma.Status.APPROVED else Proforma.Status.APPROVED
    with transaction.atomic():
        proforma = Proforma.objects.select_for_update().get(pk=proforma_id)
        if proforma.status == outcome:
            return proforma
        if proforma.status == opposite:
            raise ProformaError("already_answered", "پیش‌فاکتور قبلاً پاسخ داده شده است.")
        if proforma.status in _BLOCKED:
            code, detail = _BLOCKED[Proforma.Status(proforma.status)]
            raise ProformaError(code, detail)
        if effective_status(proforma) == EXPIRED:
            raise ProformaError("expired", "مهلت این پیش‌فاکتور تمام شده است.")
        proforma.status = outcome
        proforma.responded_at = timezone.now()
        proforma.response_ip_hash = ip_digest(request, "proforma")
        proforma.response_user_agent = (request.META.get("HTTP_USER_AGENT") or "")[:200]
        proforma.rejection_reason = reason[:500]
        proforma.save()
        record(f"proformas.proforma.{outcome}", request=request, target=proforma, number=proforma.number)
    return proforma


def approve(proforma: Proforma, request: HttpRequest) -> Proforma:
    return _answer(proforma.pk, request, Proforma.Status.APPROVED)


def reject(proforma: Proforma, request: HttpRequest, reason: str = "") -> Proforma:
    return _answer(proforma.pk, request, Proforma.Status.REJECTED, reason)


def link_for(proforma: Proforma) -> str | None:
    return None if proforma.status == Proforma.Status.DRAFT else public_url(proforma)
