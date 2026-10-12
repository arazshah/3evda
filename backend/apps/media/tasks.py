import hashlib
import logging

from celery import shared_task
from django.core.files.base import ContentFile

from .images import load_normalized, lqip, renditions
from .models import MediaAsset, MediaVariant, WatermarkSetting
from .service import store_renditions
from .storage import private_storage, public_storage
from .video import process_video

logger = logging.getLogger(__name__)


@shared_task(acks_late=True)
def process_asset(asset_id: str, refresh: bool = False) -> str:
    """Make the renditions of an asset.

    `refresh` re-makes the renditions of a file that is already in use (a new watermark, say): it stays ready the whole
    time, so pages that show it do not lose it, and a failure leaves the old renditions in place.
    """
    asset = MediaAsset.objects.get(pk=asset_id)
    keep_ready = refresh and asset.status == MediaAsset.Status.READY
    if not keep_ready:
        MediaAsset.objects.filter(pk=asset.pk).update(status=MediaAsset.Status.PROCESSING, error="")
    try:
        with private_storage().open(asset.original_key) as f:
            data = f.read()
        setting = WatermarkSetting.load()
        watermark = setting if setting.enabled else None
        if asset.kind == MediaAsset.Kind.IMAGE:
            _process_image(asset, data, watermark)
        else:
            _process_video(asset, data, watermark)
        asset.watermarked = watermark is not None
        asset.status = MediaAsset.Status.READY
        asset.error = ""
    except Exception as exc:
        logger.exception("media processing failed", extra={"asset": str(asset.pk)})
        if keep_ready:
            return MediaAsset.Status.READY  # the renditions made earlier are untouched and still good
        asset.status = MediaAsset.Status.FAILED
        asset.error = f"پردازش ناموفق بود ({type(exc).__name__})."[:500]
    asset.save(update_fields=["status", "error", "watermarked", "width", "height", "duration_seconds", "lqip",
                              "updated_at"])  # fmt: skip
    return asset.status


def _process_image(asset: MediaAsset, data: bytes, watermark: WatermarkSetting | None) -> None:
    img = load_normalized(data)
    store_renditions(asset, renditions(img, watermark))
    asset.width, asset.height = img.size
    asset.lqip = lqip(img)


def _process_video(asset: MediaAsset, data: bytes, watermark: WatermarkSetting | None) -> None:
    fmt = "mp4" if asset.mime == "video/mp4" else "webm"
    result = process_video(data, fmt)
    digest = hashlib.sha256(result.data).hexdigest()[:12]
    key = f"variants/{asset.pk}/video-{digest}.{fmt}"
    storage = public_storage()
    if not storage.exists(key):
        storage.save(key, ContentFile(result.data))
    video = MediaVariant(asset=asset, name="video", format=fmt, key=key, width=result.width,
                         height=result.height, size_bytes=len(result.data))  # fmt: skip
    poster = load_normalized(result.poster_jpeg)
    store_renditions(asset, renditions(poster, watermark, prefix="poster-"), extra=[video])
    asset.width, asset.height, asset.duration_seconds = result.width, result.height, result.duration
    asset.lqip = lqip(poster)


@shared_task
def reapply_watermark() -> int:
    """Re-make the renditions of every finished file so the watermark settings apply to existing photos too."""
    ids = list(MediaAsset.objects.filter(status=MediaAsset.Status.READY).values_list("pk", flat=True))
    for asset_id in ids:
        process_asset.delay(str(asset_id), True)
    return len(ids)
