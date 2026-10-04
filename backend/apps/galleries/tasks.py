import logging

from celery import shared_task
from django.conf import settings
from django.core.files.base import ContentFile

from apps.media.images import apply_watermark, encode, load_normalized, resize
from apps.media.models import WatermarkSetting
from apps.media.storage import private_storage

from .models import GalleryPhoto

logger = logging.getLogger(__name__)


@shared_task(acks_late=True)
def process_photo(photo_id: int) -> str:
    """Make the thumbnail and the preview of a photo: watermarked (when the gallery says so), no metadata."""
    photo = GalleryPhoto.objects.select_related("gallery").filter(pk=photo_id).first()
    if photo is None:
        return "gone"  # deleted while it waited in the queue
    storage = private_storage()
    try:
        with storage.open(photo.original_key) as f:
            data = f.read()
        img = load_normalized(data)
        mark = WatermarkSetting.load() if photo.gallery.watermark else None
        base = f"galleries/{photo.gallery.public_id.hex}/previews/{photo.pk}"
        stored = 0
        keys = {}
        for name, width in (("thumb", settings.GALLERY_THUMB_WIDTH), ("preview", settings.GALLERY_PREVIEW_WIDTH)):
            out = resize(img, width)
            if mark is not None:
                out = apply_watermark(out, mark)
            blob = encode(out, "webp")
            stored += len(blob)
            keys[name] = storage.save(f"{base}-{name}.webp", ContentFile(blob))
        photo.width, photo.height = img.size
        photo.thumb_key, photo.preview_key = keys["thumb"], keys["preview"]
        photo.stored_bytes = stored
        photo.status = GalleryPhoto.Status.READY
        photo.error = ""
    except Exception as exc:
        logger.exception("gallery photo processing failed", extra={"photo": photo_id})
        photo.status = GalleryPhoto.Status.FAILED
        photo.error = f"پردازش ناموفق بود ({type(exc).__name__})."[:300]
    photo.save(update_fields=["status", "error", "width", "height", "thumb_key", "preview_key", "stored_bytes"])
    return str(photo.status)


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
