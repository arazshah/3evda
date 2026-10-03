"""The proforma as a PDF (Persian right-to-left, or English), made from our own template."""

import base64
from datetime import date
from pathlib import Path
from typing import Any

import jdatetime
from django.template.loader import render_to_string
from weasyprint import HTML, URLFetcher

from apps.cms.models import SiteSettings
from apps.media.storage import public_storage

from .models import Proforma

ASSETS = (Path(__file__).parent / "assets").resolve()
_PERSIAN_DIGITS = str.maketrans("0123456789", "۰۱۲۳۴۵۶۷۸۹")

LABELS = {
    "fa": {
        "title": "پیش‌فاکتور", "number": "شماره", "date": "تاریخ صدور", "valid": "اعتبار تا",
        "customer": "مشتری", "contact": "تماس", "description": "شرح", "quantity": "تعداد",
        "unit_price": "قیمت واحد", "line_total": "مبلغ", "subtotal": "جمع", "discount": "تخفیف",
        "tax": "مالیات", "total": "مبلغ قابل پرداخت", "terms": "شرایط", "currency": "تومان",
        "approved": "تأیید مشتری در",
    },
    "en": {
        "title": "Proforma invoice", "number": "Number", "date": "Issued", "valid": "Valid until",
        "customer": "Customer", "contact": "Contact", "description": "Description", "quantity": "Qty",
        "unit_price": "Unit price", "line_total": "Amount", "subtotal": "Subtotal", "discount": "Discount",
        "tax": "Tax", "total": "Total due", "terms": "Terms", "currency": "Toman",
        "approved": "Approved by the customer on",
    },
}  # fmt: skip


class SafeFetcher(URLFetcher):  # type: ignore[misc]
    """The only things a proforma may load are inline images and our own font files.

    The template never links anything else; this is the second lock: even if some text slipped into the
    markup, rendering cannot reach the network or read other files on the server (SSRF, local file reads).
    """

    def fetch(self, url: str, headers: Any = None) -> Any:
        if url.startswith("data:"):
            return super().fetch(url, headers)
        if url.startswith("file://") and Path(url[7:].split("?")[0]).resolve().is_relative_to(ASSETS):
            return super().fetch(url, headers)
        raise ValueError("this address is not allowed in a proforma")


def number_text(value: int, language: str) -> str:
    text = f"{value:,}"
    return text.replace(",", "٬").translate(_PERSIAN_DIGITS) if language == "fa" else text


def date_text(day: date | None, language: str) -> str:
    if day is None:
        return ""
    if language == "fa":
        return str(jdatetime.date.fromgregorian(date=day).strftime("%Y/%m/%d")).translate(_PERSIAN_DIGITS)
    return day.isoformat()


def _logo() -> str | None:
    """The site logo as an inline image, or None (the logo is a nicety; its absence never blocks a proforma)."""
    try:
        logo = SiteSettings.load().logo
        variants = [v for v in (logo.variants.all() if logo else []) if v.format in ("webp", "png", "jpeg")]
        if not variants:
            return None
        variant = min(variants, key=lambda v: abs(v.width - 480))
        with public_storage().open(variant.key) as handle:
            data = handle.read()
        return f"data:image/{variant.format};base64,{base64.b64encode(data).decode()}"
    except Exception:
        return None


def render_pdf(proforma: Proforma) -> bytes:
    language = proforma.language if proforma.language in LABELS else "fa"
    items = [
        {
            "description": item.description,
            "quantity": number_text(item.quantity, language),
            "unit_price": number_text(item.unit_price, language),
            "line_total": number_text(item.quantity * item.unit_price, language),
        }
        for item in proforma.items.all()
    ]
    context = {
        "p": proforma,
        "l": LABELS[language],
        "lang": language,
        "dir": "rtl" if language == "fa" else "ltr",
        "items": items,
        "n": lambda value: number_text(int(value), language),
        "issuer": proforma.issuer or {},
        "number_text": proforma.number or "—",
        "issue_date": date_text(proforma.issue_date, language),
        "valid_until": date_text(proforma.valid_until, language),
        "approved_on": date_text(proforma.responded_at.date(), language)
        if proforma.status == Proforma.Status.APPROVED and proforma.responded_at
        else "",
        "subtotal": number_text(proforma.subtotal, language),
        "discount": number_text(proforma.discount, language),
        "tax": number_text(proforma.tax, language),
        "total": number_text(proforma.total, language),
        "tax_percent": number_text(int(proforma.tax_percent), language)
        if proforma.tax_percent == int(proforma.tax_percent)
        else str(proforma.tax_percent),
        "font_dir": ASSETS.as_uri(),
        "logo": _logo(),
    }
    html = render_to_string("proformas/pdf.html", context)
    return bytes(
        HTML(
            string=html, base_url="about:blank", url_fetcher=SafeFetcher(allowed_protocols={"data", "file"})
        ).write_pdf()
    )
