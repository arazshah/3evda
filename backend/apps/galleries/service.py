"""Making galleries and putting photos in them. Client photos live only in the private bucket."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import Sum
from django.utils import timezone

from apps.media.storage import private_storage
from apps.media.validation import UploadRejected, inspect_upload

from .models import Gallery, GalleryPhoto

EXPIRED = "expired"  # shown, never stored: it follows from the date


class GalleryError(Exception):
    def __init__(self, code: str, detail: str, status: int = 409) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail
        self.status = status


def effective_status(gallery: Gallery, now: datetime | None = None) -> str:
    live = gallery.status in (Gallery.Status.PUBLISHED, Gallery.Status.SUBMITTED)
    if live and gallery.expires_at and gallery.expires_at <= (now or timezone.now()):
        return EXPIRED
    return str(gallery.status)


def set_password(gallery: Gallery, raw: str) -> None:
    gallery.password_hash = make_password(raw) if raw else ""


def _sha256(upload: UploadedFile[bytes]) -> str:
    digest = hashlib.sha256()
    upload.seek(0)
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def add_photo(gallery: Gallery, upload: UploadedFile[bytes]) -> GalleryPhoto:
    """Check and store one photo, then queue its previews. Raises `GalleryError` for anything refusable."""
    from .tasks import process_photo

    if gallery.status == Gallery.Status.ARCHIVED:
        raise GalleryError("archived", "گالری بایگانی‌شده است؛ ابتدا آن را از بایگانی درآورید.")
    try:
        info = inspect_upload(upload)
    except UploadRejected as error:
        raise GalleryError(error.code, error.message, 400) from error
    if info.kind != "image":
        raise GalleryError("unsupported_type", "فقط عکس می‌توان در گالری گذاشت.", 400)
    checksum = _sha256(upload)

    # The count and the position are read under the gallery's row lock, so parallel uploads cannot pass the limit.
    with transaction.atomic():
        locked = Gallery.objects.select_for_update().get(pk=gallery.pk)
        photos = GalleryPhoto.objects.filter(gallery=locked)
        if photos.count() >= settings.GALLERY_MAX_PHOTOS:
            raise GalleryError("too_many", f"هر گالری حداکثر {settings.GALLERY_MAX_PHOTOS} عکس دارد.")
        if photos.filter(sha256=checksum).exists():
            raise GalleryError("duplicate", "این عکس قبلاً در همین گالری بارگذاری شده است.")
        last = photos.order_by("-position").first()
        key = private_storage().save(f"galleries/{locked.public_id.hex}/originals/{uuid.uuid4()}{info.ext}", upload)
        try:
            photo = GalleryPhoto.objects.create(
                gallery=locked,
                original_key=key,
                original_filename=(upload.name or "photo")[:255],
                mime=info.mime,
                size_bytes=info.size,
                sha256=checksum,
                width=info.width,
                height=info.height,
                position=(last.position + 1) if last else 0,
            )
        except IntegrityError as error:  # two identical uploads at the same moment
            private_storage().delete(key)
            raise GalleryError("duplicate", "این عکس قبلاً در همین گالری بارگذاری شده است.") from error
        transaction.on_commit(lambda: process_photo.apply_async(args=[photo.pk], queue="galleries"))
    return photo


def _forget_files(keys: list[str]) -> None:
    from .tasks import delete_files

    keys = [k for k in keys if k]
    if keys:
        transaction.on_commit(lambda: delete_files.apply_async(args=[keys], queue="galleries"))


def photo_keys(photo: GalleryPhoto) -> list[str]:
    return [photo.original_key, photo.thumb_key, photo.preview_key]


def delete_photo(photo: GalleryPhoto) -> None:
    with transaction.atomic():
        keys = photo_keys(photo)
        photo.delete()
        _forget_files(keys)


def delete_gallery(gallery: Gallery) -> None:
    """The rows go at once; the files follow in the worker (and are retried if the store is busy)."""
    with transaction.atomic():
        keys = [k for photo in gallery.photos.all() for k in photo_keys(photo)]
        gallery.delete()
        _forget_files(keys)


def reorder(gallery: Gallery, ids: list[int]) -> None:
    with transaction.atomic():
        Gallery.objects.select_for_update().get(pk=gallery.pk)
        existing = set(GalleryPhoto.objects.filter(gallery=gallery).values_list("pk", flat=True))
        if len(ids) != len(set(ids)) or set(ids) != existing:
            raise GalleryError("bad_order", "فهرست باید دقیقاً همه‌ی عکس‌ها را یک‌بار شامل شود.", 400)
        for position, pk in enumerate(ids):
            GalleryPhoto.objects.filter(pk=pk).update(position=position)


def usage_bytes(gallery: Gallery) -> int:
    total = gallery.photos.aggregate(a=Sum("size_bytes"), b=Sum("stored_bytes"))
    return int(total["a"] or 0) + int(total["b"] or 0)


def publish(gallery: Gallery) -> Gallery:
    if gallery.status != Gallery.Status.DRAFT:
        raise GalleryError("not_draft", "فقط پیش‌نویس را می‌توان منتشر کرد.")
    if not gallery.photos.filter(status=GalleryPhoto.Status.READY).exists():
        raise GalleryError("no_photos", "دست‌کم یک عکس آماده لازم است.")
    gallery.status = Gallery.Status.PUBLISHED
    gallery.save(update_fields=["status", "updated_at"])
    return gallery


def reopen(gallery: Gallery) -> Gallery:
    """Let the client change their choices again after they submitted."""
    if gallery.status != Gallery.Status.SUBMITTED:
        raise GalleryError("not_submitted", "این گالری نهایی نشده است.")
    gallery.status = Gallery.Status.PUBLISHED
    gallery.save(update_fields=["status", "updated_at"])
    return gallery


def archive(gallery: Gallery) -> Gallery:
    gallery.status = Gallery.Status.ARCHIVED
    gallery.save(update_fields=["status", "updated_at"])
    return gallery


def unarchive(gallery: Gallery) -> Gallery:
    if gallery.status != Gallery.Status.ARCHIVED:
        raise GalleryError("not_archived", "این گالری بایگانی نیست.")
    gallery.status = Gallery.Status.PUBLISHED if gallery.photos.exists() else Gallery.Status.DRAFT
    gallery.save(update_fields=["status", "updated_at"])
    return gallery


def new_link(gallery: Gallery) -> Gallery:
    gallery.link_version += 1
    gallery.save(update_fields=["link_version", "updated_at"])
    return gallery
