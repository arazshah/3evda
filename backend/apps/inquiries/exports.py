import csv
import io
from collections.abc import Iterable
from typing import Any

from .models import Inquiry

COLUMNS = [
    "id", "created_at", "name", "brand", "phone", "whatsapp", "telegram", "email", "service", "quantity",
    "estimate_low", "estimate_high", "status", "message", "internal_note",
]  # fmt: skip
_DANGEROUS_START = ("=", "+", "-", "@", "\t", "\r")


def safe_cell(value: Any) -> Any:
    """Stop spreadsheets from running a cell as a formula (CSV injection): text that starts with a formula
    character gets a leading apostrophe. Numbers and empty cells are left alone."""
    if isinstance(value, str) and value.startswith(_DANGEROUS_START):
        return "'" + value
    return value


def to_csv(inquiries: Iterable[Inquiry]) -> str:
    out = io.StringIO()
    out.write("﻿")  # so Excel reads the file as UTF-8 (Persian text)
    writer = csv.writer(out)
    writer.writerow(COLUMNS)
    for i in inquiries:
        writer.writerow(
            [
                safe_cell(v)
                for v in (
                    i.pk,
                    i.created_at.isoformat(),
                    i.name,
                    i.brand,
                    i.phone,
                    i.whatsapp,
                    i.telegram,
                    i.email,
                    i.service_label,
                    i.quantity,
                    i.estimate_low,
                    i.estimate_high,
                    i.status,
                    i.message,
                    i.internal_note,
                )
            ]
        )
    return out.getvalue()
