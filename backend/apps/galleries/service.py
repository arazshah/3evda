"""Making galleries and putting photos in them. Client photos live only in the private bucket."""

from __future__ import annotations

import hashlib
import uuid
from datetime import datetime, timedelta

from django.conf import settings
from django.contrib.auth.hashers import make_password
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction
from django.db.models import Q, QuerySet, Sum
from django.utils import timezone

from apps.core.signed import signed_path
from apps.media.storage import private_storage
from apps.media.validation import UploadRejected, inspect_upload

from .models import DownloadLog, FinalFile, Gallery, GalleryPhoto, Selection, ZipJob

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


def add_photo(gallery: Gallery, upload: UploadedFile[bytes], *, queue: bool = True) -> GalleryPhoto:
    """Check and store one photo, then queue its previews (`queue=False`: the caller makes them).

    Raises `GalleryError` for anything refusable.
    """
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
        if locked.status == Gallery.Status.ARCHIVED:  # archived while the upload was being checked
            raise GalleryError("archived", "گالری بایگانی‌شده است؛ ابتدا آن را از بایگانی درآورید.")
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
        if queue:
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
        keys += [f.key for f in gallery.finals.all()] + [z.key for z in gallery.zips.all()]
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


def extra_bytes(gallery: Gallery) -> int:
    """Space taken besides the photos: finished files and archives."""
    finals = gallery.finals.aggregate(a=Sum("size_bytes"))["a"] or 0
    zips = gallery.zips.filter(status=ZipJob.Status.READY).aggregate(a=Sum("size_bytes"))["a"] or 0
    return int(finals) + int(zips)


def usage_bytes(gallery: Gallery) -> int:
    total = gallery.photos.aggregate(a=Sum("size_bytes"), b=Sum("stored_bytes"))
    return int(total["a"] or 0) + int(total["b"] or 0) + extra_bytes(gallery)


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


# ---- the client's side -----------------------------------------------------------------------------


def client_can_see(gallery: Gallery) -> bool:
    """Drafts and archived galleries do not exist for the client."""
    return gallery.status in (Gallery.Status.PUBLISHED, Gallery.Status.SUBMITTED)


def set_selection(
    gallery: Gallery, photo_id: int, *, selected: bool | None, comment: str | None, retouch: bool | None
) -> Selection:
    """Change one photo's choice; the limit is counted under the gallery's row lock (no parallel overshoot)."""
    with transaction.atomic():
        locked = Gallery.objects.select_for_update().get(pk=gallery.pk)
        if locked.status == Gallery.Status.SUBMITTED:
            raise GalleryError("submitted", "انتخاب‌ها نهایی شده و دیگر تغییر نمی‌کند.")
        if locked.status != Gallery.Status.PUBLISHED or (locked.expires_at and locked.expires_at <= timezone.now()):
            raise GalleryError("unavailable", "این گالری در دسترس نیست.", 410)
        photo = GalleryPhoto.objects.filter(pk=photo_id, gallery=locked, status=GalleryPhoto.Status.READY).first()
        if photo is None:
            raise GalleryError("not_found", "عکس پیدا نشد.", 404)
        row, _ = Selection.objects.get_or_create(photo=photo)
        if selected and not row.selected and locked.selection_limit is not None:
            chosen = Selection.objects.filter(photo__gallery=locked, selected=True).count()
            if chosen >= locked.selection_limit:
                raise GalleryError("limit_reached", f"حداکثر {locked.selection_limit} عکس را می‌توان انتخاب کرد.")
        if selected is not None:
            row.selected = selected
        if comment is not None:
            row.comment = comment
        if retouch is not None:
            row.retouch = retouch
        row.save()
        return row


def submit(gallery: Gallery, ip_hash: str) -> Gallery:
    """Lock the choices. Sending again changes nothing."""
    with transaction.atomic():
        locked = Gallery.objects.select_for_update().get(pk=gallery.pk)
        if locked.status == Gallery.Status.SUBMITTED:
            return locked
        if locked.status != Gallery.Status.PUBLISHED or (locked.expires_at and locked.expires_at <= timezone.now()):
            raise GalleryError("unavailable", "این گالری در دسترس نیست.", 410)
        if not Selection.objects.filter(photo__gallery=locked, selected=True).exists():
            raise GalleryError("nothing_selected", "دست‌کم یک عکس را انتخاب کنید.")
        locked.status = Gallery.Status.SUBMITTED
        locked.submitted_at = timezone.now()
        locked.submitted_ip_hash = ip_hash
        locked.save(update_fields=["status", "submitted_at", "submitted_ip_hash", "updated_at"])
        return locked


# ---- downloads --------------------------------------------------------------------------------------

DOWNLOAD_TTL = 60
ZIP_KEEP = timedelta(hours=24)

# What each level lets the client take: (only the chosen photos?, the original file?). `none` allows nothing.
LEVELS: dict[str, tuple[bool, bool] | None] = {
    Gallery.DownloadLevel.NONE: None,
    Gallery.DownloadLevel.SELECTED: (True, False),
    Gallery.DownloadLevel.ALL_WEB: (False, False),
    Gallery.DownloadLevel.SELECTED_ORIGINAL: (True, True),
    Gallery.DownloadLevel.ALL_ORIGINAL: (False, True),
}


def download_scope(gallery: Gallery) -> tuple[bool, bool]:
    """(only_selected, originals) for the gallery's level, or a refusal."""
    scope = LEVELS.get(gallery.download_level)
    if scope is None:
        raise GalleryError("download_disabled", "دانلود برای این گالری فعال نیست.", 403)
    return scope


def downloadable(gallery: Gallery, only_selected: bool) -> QuerySet[GalleryPhoto]:
    photos = gallery.photos.filter(status=GalleryPhoto.Status.READY)
    return photos.filter(selection__selected=True) if only_selected else photos


def _safe_name(name: str, fallback: str) -> str:
    cleaned = name.replace("\\", "/").rsplit("/", 1)[-1].replace("\x00", "").strip().lstrip(".")
    return cleaned[:200] or fallback


def file_name(photo: GalleryPhoto, originals: bool) -> str:
    base = _safe_name(photo.original_filename, f"photo-{photo.pk}")
    if originals:
        return base
    stem = base.rsplit(".", 1)[0] if "." in base else base
    return f"{stem}.webp"


def log_download(gallery: Gallery, kind: str, files: int, originals: bool, ip_hash: str) -> None:
    DownloadLog.objects.create(gallery=gallery, kind=kind, files=files, originals=originals, ip_hash=ip_hash)


def photo_download(gallery: Gallery, photo_id: int, ip_hash: str) -> tuple[str, str]:
    """A 60-second link to one photo, if the level allows that photo. Returns (url, filename)."""
    only_selected, originals = download_scope(gallery)
    photo = downloadable(gallery, only_selected).filter(pk=photo_id).first()
    if photo is None:
        raise GalleryError("not_found", "این عکس برای دانلود در دسترس نیست.", 404)
    name = file_name(photo, originals)
    key = photo.original_key if originals else photo.preview_key
    log_download(gallery, DownloadLog.Kind.PHOTO, 1, originals, ip_hash)
    return signed_path(key, expire=DOWNLOAD_TTL, filename=name), name


def start_zip(gallery: Gallery) -> ZipJob:
    """Queue an archive of everything the level allows. A second request while one is being made gets that one."""
    from .tasks import build_zip

    only_selected, originals = download_scope(gallery)
    with transaction.atomic():
        locked = Gallery.objects.select_for_update().get(pk=gallery.pk)
        active = locked.zips.filter(status__in=[ZipJob.Status.QUEUED, ZipJob.Status.RUNNING]).first()
        if active is not None:
            return active
        total = downloadable(locked, only_selected).count()
        if total == 0:
            raise GalleryError("nothing_to_download", "عکسی برای دانلود وجود ندارد.", 409)
        job = ZipJob.objects.create(gallery=locked, originals=originals, only_selected=only_selected, total=total)
        transaction.on_commit(lambda: build_zip.apply_async(args=[job.pk], queue="galleries"))
    return job


def zip_link(job: ZipJob, ip_hash: str) -> str:
    """A 60-second link to a finished archive (the level is checked again: it may have changed since)."""
    only_selected, originals = download_scope(job.gallery)
    # The archive keeps its quality and contents for a day, but the permissions may have changed since it was made.
    allowed = set(downloadable(job.gallery, only_selected).values_list("pk", flat=True))
    if (job.originals and not originals) or not set(job.photo_ids) <= allowed:
        raise GalleryError("stale", "تنظیمات یا انتخاب‌ها عوض شده؛ ZIP را دوباره بسازید.", 409)
    name = f"{_safe_name(job.gallery.title, 'gallery')}.zip"
    log_download(job.gallery, DownloadLog.Kind.ZIP, job.total, job.originals, ip_hash)
    return signed_path(job.key, expire=DOWNLOAD_TTL, filename=name)


def add_final(gallery: Gallery, upload: UploadedFile[bytes]) -> FinalFile:
    try:
        info = inspect_upload(upload)
    except UploadRejected as error:
        raise GalleryError(error.code, error.message, 400) from error
    if info.kind != "image":
        raise GalleryError("unsupported_type", "فقط عکس را می‌توان به‌عنوان نسخه‌ی نهایی گذاشت.", 400)
    with transaction.atomic():
        locked = Gallery.objects.select_for_update().get(pk=gallery.pk)
        last = locked.finals.order_by("-position").first()
        key = private_storage().save(f"galleries/{locked.public_id.hex}/finals/{uuid.uuid4()}{info.ext}", upload)
        return FinalFile.objects.create(
            gallery=locked,
            key=key,
            filename=_safe_name(upload.name or "", "final"),
            mime=info.mime,
            size_bytes=info.size,
            position=(last.position + 1) if last else 0,
        )


def delete_final(final: FinalFile) -> None:
    with transaction.atomic():
        key = final.key
        final.delete()
        _forget_files([key])


def final_download(gallery: Gallery, final_id: int, ip_hash: str) -> tuple[str, str]:
    final = gallery.finals.filter(pk=final_id).first()
    if final is None:
        raise GalleryError("not_found", "فایل پیدا نشد.", 404)
    log_download(gallery, DownloadLog.Kind.FINAL, 1, True, ip_hash)
    return signed_path(final.key, expire=DOWNLOAD_TTL, filename=final.filename), final.filename


def selections_overview(gallery: Gallery, only: str = "") -> dict[str, object]:
    """What the client chose, for the owner: counts, the rows (optionally filtered) and the names for Lightroom."""
    rows = list(
        Selection.objects.filter(photo__gallery=gallery)
        .filter(Q(selected=True) | Q(retouch=True) | ~Q(comment=""))
        .select_related("photo")
        .order_by("photo__position", "photo__id")
    )
    chosen = [r for r in rows if r.selected]
    shown = {
        "selected": chosen,
        "retouch": [r for r in rows if r.retouch],
        "commented": [r for r in rows if r.comment],
    }.get(only, rows)
    return {
        "photo_count": gallery.photos.count(),
        "selected_count": len(chosen),
        "retouch_count": sum(1 for r in rows if r.retouch),
        "comment_count": sum(1 for r in rows if r.comment),
        "submitted_at": gallery.submitted_at,
        # Lightroom's text filter takes names without the extension, separated by commas.
        "filenames": ", ".join(r.photo.original_filename.rsplit(".", 1)[0] for r in chosen),
        "items": [
            {
                "photo": r.photo_id,
                "filename": r.photo.original_filename,
                "thumb_url": signed_path(r.photo.thumb_key, expire=300) if r.photo.thumb_key else None,
                "selected": r.selected,
                "comment": r.comment,
                "retouch": r.retouch,
            }
            for r in shown
        ],
    }
