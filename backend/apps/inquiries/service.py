from __future__ import annotations

from typing import Any

from django.core.files.uploadedfile import UploadedFile
from django.db import transaction
from django.http import HttpRequest

from apps.core.privacy import ip_digest
from apps.pricing.models import QuoteRule
from apps.pricing.service import run_estimate

from . import attachments
from .models import Inquiry, InquiryAttachment

Upload = tuple["UploadedFile[bytes]", str, str]  # (file, mime, extension) — already inspected


def _labels(keys: list[str], language: str) -> list[dict[str, str]]:
    """The labels as the visitor saw them: their language, with the Persian text where English is empty."""
    found = {
        r.key: (r.label_en or r.label_fa) if language == "en" else r.label_fa
        for r in QuoteRule.objects.filter(key__in=keys)
    }
    return [{"key": key, "label": found.get(key, key)} for key in dict.fromkeys(keys)]


def create_inquiry(data: dict[str, Any], uploads: list[Upload], request: HttpRequest) -> Inquiry:
    """Store an enquiry with the estimate the visitor saw. Raises `quote.QuoteError` for unknown choices."""
    estimate = None
    service_label = ""
    options: dict[str, Any] = {}
    if data.get("service"):
        estimate = run_estimate(
            {
                "service": data["service"],
                "quantity": data["quantity"],
                "addons": data.get("addons", []),
                "multipliers": data.get("multipliers", []),
            }
        )
        language = data.get("language", "fa")
        service_label = _labels([data["service"]], language)[0]["label"]
        options = {
            "addons": _labels(data.get("addons", []), language),
            "multipliers": _labels(data.get("multipliers", []), language),
        }

    stored: list[str] = []
    try:
        with transaction.atomic():
            inquiry = Inquiry.objects.create(
                name=data["name"],
                brand=data.get("brand", ""),
                phone=data.get("phone", ""),
                whatsapp=data.get("whatsapp", ""),
                telegram=data.get("telegram", ""),
                email=data.get("email", ""),
                language=data.get("language", "fa"),
                service_key=data.get("service", ""),
                service_label=service_label,
                quantity=data.get("quantity") if data.get("service") else None,
                options=options,
                estimate_low=estimate.low if estimate else None,
                estimate_high=estimate.high if estimate else None,
                message=data.get("message", ""),
                ip_hash=ip_digest(request, "inquiry"),
            )
            for upload, mime, ext in uploads:
                key = attachments.store(upload, ext)
                stored.append(key)
                InquiryAttachment.objects.create(
                    inquiry=inquiry,
                    key=key,
                    original_name=attachments.clean_name(upload.name or ""),
                    mime=mime,
                    size=upload.size or 0,
                )
    except Exception:
        # The database work was rolled back; do not leave the files behind.
        for key in stored:
            attachments.delete(key)
        raise
    return inquiry
