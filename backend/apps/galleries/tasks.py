import logging
import shutil
import tempfile
import uuid
import zipfile
from datetime import timedelta

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile, File
from django.utils import timezone

from apps.media.images import apply_watermark, encode, fit_long_edge, load_normalized
from apps.media.models import WatermarkSetting
from apps.media.storage import private_storage

from .models import GalleryPhoto, ZipJob

logger = logging.getLogger(__name__)


@shared_task(bind=True, acks_late=True, max_retries=3, default_retry_delay=30)
def process_photo(self, photo_id: int) -> str:  # type: ignore[no-untyped-def]
    """Make the thumbnail and the preview of a photo: watermarked (when the gallery says so), no metadata.

    A busy or unreachable store is retried; a file that cannot be decoded is marked failed at once.
    """
    photo = GalleryPhoto.objects.select_related("gallery").filter(pk=photo_id).first()
    if photo is None:
        return "gone"  # deleted while it waited in the queue
    storage = private_storage()
    try:
        with storage.open(photo.original_key) as f:
            data = f.read()
    except Exception as exc:
        logger.exception("gallery photo could not be read", extra={"photo": photo_id})
        if self.request.retries < self.max_retries:
            raise self.retry(exc=exc) from exc
        return _fail(photo, exc)
    saved: list[str] = []
    try:
        img = load_normalized(data)
        mark = WatermarkSetting.load() if photo.gallery.watermark else None
        base = f"galleries/{photo.gallery.public_id.hex}/previews/{photo.pk}"
        stored = 0
        keys = {}
        for name, edge in (("thumb", settings.GALLERY_THUMB_WIDTH), ("preview", settings.GALLERY_PREVIEW_WIDTH)):
            out = fit_long_edge(img, edge)
            if mark is not None:
                out = apply_watermark(out, mark)
            blob = encode(out, "webp", exif=False)
            stored += len(blob)
            keys[name] = storage.save(f"{base}-{name}.webp", ContentFile(blob))
            saved.append(keys[name])
    except Exception as exc:
        logger.exception("gallery photo processing failed", extra={"photo": photo_id})
        if saved:
            delete_files.apply_async(args=[saved], queue="galleries")
        if isinstance(exc, (OSError, ConnectionError)) and self.request.retries < self.max_retries:
            raise self.retry(exc=exc) from exc
        return _fail(photo, exc)
    # The photo may have been deleted while the previews were made: then nobody else knows these files.
    changed = GalleryPhoto.objects.filter(pk=photo.pk).update(
        width=img.width,
        height=img.height,
        thumb_key=keys["thumb"],
        preview_key=keys["preview"],
        stored_bytes=stored,
        status=GalleryPhoto.Status.READY,
        error="",
    )
    if not changed:
        delete_files.apply_async(args=[saved], queue="galleries")
        return "gone"
    return str(GalleryPhoto.Status.READY)


def _fail(photo: GalleryPhoto, exc: Exception) -> str:
    GalleryPhoto.objects.filter(pk=photo.pk).update(
        status=GalleryPhoto.Status.FAILED, error=f"پردازش ناموفق بود ({type(exc).__name__})."[:300]
    )
    return str(GalleryPhoto.Status.FAILED)


@shared_task(bind=True, acks_late=True, max_retries=5, default_retry_delay=60)
def delete_files(self, keys: list[str]) -> int:  # type: ignore[no-untyped-def]
    """Remove files of deleted photos and galleries; whatever the store could not remove is tried again."""
    storage = private_storage()
    left = []
    for key in keys:
        try:
            storage.delete(key)
        except Exception:
            logger.exception("could not delete a gallery file", extra={"key": key})
            left.append(key)
    if left:
        raise self.retry(args=[left])
    return len(keys)


def _unique(name: str, used: set[str]) -> str:
    """Two photos may share a file name; the archive must not hold two entries with one name."""
    candidate, n = name, 1
    stem, dot, ext = name.rpartition(".")
    while candidate.lower() in used:
        n += 1
        candidate = f"{stem or name} ({n}){dot}{ext}" if dot else f"{name} ({n})"
    used.add(candidate.lower())
    return candidate


@shared_task(acks_late=True)
def build_zip(job_id: int) -> str:
    """Stream the files from the private bucket into one archive (on disk, never all in memory) and store it."""
    from .service import downloadable, file_name

    job = ZipJob.objects.select_related("gallery").filter(pk=job_id).first()
    if job is None or job.status not in (ZipJob.Status.QUEUED, ZipJob.Status.RUNNING):
        return "gone"
    ZipJob.objects.filter(pk=job.pk).update(status=ZipJob.Status.RUNNING, done=0)
    storage = private_storage()
    key = ""
    try:
        used: set[str] = set()
        items = [
            (p.original_key if job.originals else p.preview_key, _unique(file_name(p, job.originals), used))
            for p in downloadable(job.gallery, job.only_selected).order_by("position", "id")
        ]
        ZipJob.objects.filter(pk=job.pk).update(total=len(items))
        with tempfile.TemporaryFile() as tmp:
            # Photos are already compressed; storing them is faster and the size is the same.
            with zipfile.ZipFile(tmp, "w", zipfile.ZIP_STORED, allowZip64=True) as archive:
                for index, (source, name) in enumerate(items, start=1):
                    with storage.open(source) as src, archive.open(name, "w", force_zip64=True) as dst:
                        shutil.copyfileobj(src, dst, 1024 * 1024)
                    if index % 5 == 0 or index == len(items):
                        ZipJob.objects.filter(pk=job.pk).update(done=index)
            size = tmp.tell()
            tmp.seek(0)
            key = storage.save(f"galleries/{job.gallery.public_id.hex}/zips/{uuid.uuid4()}.zip", File(tmp))
    except Exception as exc:
        logger.exception("zip failed", extra={"job": job_id})
        ZipJob.objects.filter(pk=job.pk).update(
            status=ZipJob.Status.FAILED, error=f"ساخت ZIP ناموفق بود ({type(exc).__name__})."[:300]
        )
        if key:
            delete_files.apply_async(args=[[key]], queue="galleries")
        return "failed"
    changed = ZipJob.objects.filter(pk=job.pk).update(
        status=ZipJob.Status.READY,
        key=key,
        size_bytes=size,
        done=len(items),
        expires_at=timezone.now() + timedelta(hours=24),
    )
    if not changed:  # the gallery was deleted while the archive was made
        delete_files.apply_async(args=[[key]], queue="galleries")
        return "gone"
    return "ready"


STUCK_AFTER = timedelta(hours=2)


@shared_task
def cleanup_zips() -> int:
    """Hourly: remove archives past their day, give up on jobs that never finished, forget old failures."""
    now = timezone.now()
    ZipJob.objects.filter(
        status__in=[ZipJob.Status.QUEUED, ZipJob.Status.RUNNING], created_at__lte=now - STUCK_AFTER
    ).update(status=ZipJob.Status.FAILED, error="ساخت ZIP از حد زمانی گذشت.")
    old = list(
        ZipJob.objects.filter(expires_at__lte=now)
        | ZipJob.objects.filter(status=ZipJob.Status.FAILED, created_at__lte=now - timedelta(days=1))
    )
    keys = [job.key for job in old if job.key]
    ZipJob.objects.filter(pk__in=[job.pk for job in old]).delete()
    if keys:
        delete_files.apply_async(args=[keys], queue="galleries")
    return len(old)
