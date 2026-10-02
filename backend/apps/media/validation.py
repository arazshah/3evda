"""Upload inspection: identify files by their content, never by name or client-sent type."""

from __future__ import annotations

import warnings
from dataclasses import dataclass

from django.conf import settings
from django.core.files.uploadedfile import UploadedFile
from PIL import Image, UnidentifiedImageError

MESSAGES = {
    "empty": "فایل خالی است.",
    "unsupported_type": "این نوع فایل پشتیبانی نمی‌شود. JPEG، PNG، WebP، AVIF، TIFF، MP4 یا WebM بفرستید.",
    "too_large": "حجم فایل از حد مجاز بیشتر است.",
    "too_many_pixels": "ابعاد تصویر بیش از حد بزرگ است.",
    "invalid_image": "فایل تصویر خراب است یا قابل خواندن نیست.",
}

_IMAGE_FORMATS = {"JPEG": ("image/jpeg", ".jpg"), "PNG": ("image/png", ".png"), "WEBP": ("image/webp", ".webp"),
                  "AVIF": ("image/avif", ".avif"), "TIFF": ("image/tiff", ".tiff")}  # fmt: skip
_MP4_BRANDS = {b"isom", b"iso2", b"iso4", b"iso5", b"iso6", b"mp41", b"mp42", b"avc1", b"M4V ", b"mmp4", b"dash"}


class UploadRejected(Exception):
    def __init__(self, code: str) -> None:
        super().__init__(code)
        self.code = code
        self.message = MESSAGES[code]


@dataclass(frozen=True)
class UploadInfo:
    kind: str
    mime: str
    ext: str
    size: int
    width: int | None = None
    height: int | None = None


def sniff(head: bytes) -> tuple[str, str, str] | None:
    """(kind, mime, ext) from the leading bytes, or None if unsupported."""
    if head[:3] == b"\xff\xd8\xff":
        return ("image", "image/jpeg", ".jpg")
    if head[:8] == b"\x89PNG\r\n\x1a\n":
        return ("image", "image/png", ".png")
    if head[:4] == b"RIFF" and head[8:12] == b"WEBP":
        return ("image", "image/webp", ".webp")
    if head[:4] in (b"II*\x00", b"MM\x00*"):
        return ("image", "image/tiff", ".tiff")
    if head[4:8] == b"ftyp":
        brand = head[8:12]
        if brand in (b"avif", b"avis"):
            return ("image", "image/avif", ".avif")
        if brand in _MP4_BRANDS:
            return ("video", "video/mp4", ".mp4")
        return None
    if head[:4] == b"\x1a\x45\xdf\xa3" and b"webm" in head[:64]:
        return ("video", "video/webm", ".webm")
    return None


def inspect_upload(upload: UploadedFile[bytes]) -> UploadInfo:
    size = upload.size or 0
    if size == 0:
        raise UploadRejected("empty")
    upload.seek(0)
    head = upload.read(64)
    upload.seek(0)
    detected = sniff(head)
    if detected is None:
        raise UploadRejected("unsupported_type")
    kind, mime, ext = detected

    limit = settings.MEDIA_MAX_IMAGE_BYTES if kind == "image" else settings.MEDIA_MAX_VIDEO_BYTES
    if size > limit:
        raise UploadRejected("too_large")
    if kind == "video":
        return UploadInfo(kind, mime, ext, size)

    try:
        width, height = _check_image(upload, mime)
    finally:
        upload.seek(0)
    return UploadInfo(kind, mime, ext, size, width, height)


def _check_image(upload: UploadedFile[bytes], mime: str) -> tuple[int, int]:
    try:
        with warnings.catch_warnings():
            warnings.simplefilter("error", Image.DecompressionBombWarning)
            img = Image.open(upload)
            if _IMAGE_FORMATS.get(img.format or "", ("",))[0] != mime:
                raise UploadRejected("unsupported_type")
            width, height = img.size
            # Checked from the header alone, before any pixel is decoded.
            if width * height > settings.MEDIA_MAX_PIXELS:
                raise UploadRejected("too_many_pixels")
            if img.format == "JPEG":
                # Cheap full-stream decode at 1/8 scale catches truncated files.
                img.draft("RGB", (max(1, width // 8), max(1, height // 8)))
                img.load()
            else:
                img.verify()
    except UploadRejected:
        raise
    except (Image.DecompressionBombError, Image.DecompressionBombWarning) as exc:
        raise UploadRejected("too_many_pixels") from exc
    except (UnidentifiedImageError, OSError, SyntaxError, ValueError) as exc:
        raise UploadRejected("invalid_image") from exc
    return width, height
