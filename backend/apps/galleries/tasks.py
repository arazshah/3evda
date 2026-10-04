import logging

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile

from apps.media.images import apply_watermark, encode, fit_long_edge, load_normalized
from apps.media.models import WatermarkSetting
from apps.media.storage import private_storage

from .models import GalleryPhoto

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
