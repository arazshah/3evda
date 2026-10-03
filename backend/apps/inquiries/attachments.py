"""Files from anonymous visitors: images and PDFs only, recognised by content, stored privately."""

from __future__ import annotations

import os
import re
import uuid

from django.core.files.uploadedfile import UploadedFile

from apps.media.storage import private_storage
from apps.media.validation import UploadRejected, inspect_upload

MAX_FILES = 3
MAX_BYTES = 10 * 1024 * 1024
# A little more than three full files plus the form fields; a bigger request is refused before it is parsed.
MAX_REQUEST_BYTES = MAX_FILES * MAX_BYTES + 1024 * 1024

MESSAGES = {
    "too_many": f"حداکثر {MAX_FILES} فایل می‌توانید پیوست کنید.",
    "too_large": "حجم هر فایل باید کمتر از ۱۰ مگابایت باشد.",
    "unsupported": "فقط تصویر (JPEG، PNG، WebP) و فایل PDF پذیرفته می‌شود.",
    "empty": "فایل خالی است.",
}
_IMAGE_TYPES = {"image/jpeg", "image/png", "image/webp"}


class AttachmentRejected(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
        self.message = MESSAGES[code]


def inspect(upload: UploadedFile[bytes]) -> tuple[str, str]:
    """(mime, extension) of an acceptable file; raises `AttachmentRejected` for everything else."""
    size = upload.size or 0
    if size == 0:
        raise AttachmentRejected("empty")
    if size > MAX_BYTES:
        raise AttachmentRejected("too_large")
    upload.seek(0)
    head = upload.read(8)
    upload.seek(0)
    if head.startswith(b"%PDF-"):
        return "application/pdf", ".pdf"
    try:
        info = inspect_upload(upload)
    except UploadRejected as error:
        raise AttachmentRejected("unsupported") from error
    if info.mime not in _IMAGE_TYPES:
        raise AttachmentRejected("unsupported")
    return info.mime, info.ext


def clean_name(name: str) -> str:
    """The name shown to the owner: no directories, no control characters, bounded length."""
    base = os.path.basename(name.replace("\\", "/"))
    base = re.sub(r"[\x00-\x1f\x7f]", "", base).strip()
    return (base or "file")[:200]


def store(upload: UploadedFile[bytes], ext: str) -> str:
    """Save to the private bucket under a random key (the visitor's file name never becomes part of it)."""
    key = f"inquiries/{uuid.uuid4().hex}{ext}"
    upload.seek(0)
    return str(private_storage().save(key, upload))


def delete(key: str) -> None:
    private_storage().delete(key)
