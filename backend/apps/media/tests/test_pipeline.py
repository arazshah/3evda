import base64
import io
import json
import subprocess

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from PIL import Image

from apps.media.models import MediaAsset, WatermarkSetting
from apps.media.service import create_asset
from apps.media.storage import public_storage
from apps.media.tasks import process_asset

from .factories import ARTIST, COPYRIGHT, exif_tags, has_gps, image_bytes, video_bytes

pytestmark = pytest.mark.django_db


def make(data: bytes, name: str = "photo.jpg", user=None) -> MediaAsset:  # type: ignore[no-untyped-def]
    asset, created = create_asset(SimpleUploadedFile(name, data), user=user)
    assert created
    process_asset(str(asset.pk))
    asset.refresh_from_db()
    return asset


def read_public(key: str) -> bytes:
    with public_storage().open(key) as f:
        return f.read()


def test_upload_stores_the_original_privately_and_queues_processing(
    s3_buckets, settings, django_capture_on_commit_callbacks
):
    data = image_bytes("JPEG", gps=True)
    with django_capture_on_commit_callbacks() as callbacks:
        asset, created = create_asset(SimpleUploadedFile("trip.jpg", data), user=None)

    assert created
    assert asset.status == MediaAsset.Status.PENDING
    assert asset.original_filename == "trip.jpg"
    assert asset.original_key.startswith("originals/") and asset.original_key.endswith(".jpg")
    body = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=asset.original_key)["Body"].read()
    assert body == data  # the private original is kept untouched
    assert len(callbacks) == 1  # processing is queued only after the row is committed


def test_duplicate_upload_returns_the_existing_asset(s3_buckets):
    data = image_bytes("JPEG")
    first, _ = create_asset(SimpleUploadedFile("a.jpg", data), user=None)
    second, created = create_asset(SimpleUploadedFile("b.jpg", data), user=None)
    assert not created
    assert second.pk == first.pk


def test_responsive_variants_in_webp_and_avif(s3_buckets):
    asset = make(image_bytes("JPEG", size=(3000, 2000)))

    assert asset.status == MediaAsset.Status.READY
    names = {(v.name, v.format) for v in asset.variants.all()}
    assert names == {(f"w{w}", fmt) for w in (480, 960, 1600, 2400) for fmt in ("webp", "avif")}
    w960 = asset.variants.get(name="w960", format="webp")
    assert (w960.width, w960.height) == (960, 640)
    img = Image.open(io.BytesIO(read_public(w960.key)))
    assert img.format == "WEBP" and img.size == (960, 640)


def test_small_images_are_not_upscaled(s3_buckets):
    asset = make(image_bytes("PNG", size=(1200, 800)), "small.png")
    widths = sorted({v.width for v in asset.variants.all()})
    assert widths == [480, 960, 1200]


def test_variants_carry_copyright_but_never_gps(s3_buckets):
    asset = make(image_bytes("JPEG", gps=True))
    for variant in asset.variants.filter(format="webp"):
        data = read_public(variant.key)
        assert not has_gps(data)
        assert exif_tags(data) == {ARTIST, COPYRIGHT}


def test_exif_orientation_is_applied(s3_buckets):
    asset = make(image_bytes("JPEG", size=(1200, 600), orientation=6))
    assert (asset.width, asset.height) == (600, 1200)


def test_transparency_is_preserved(s3_buckets):
    asset = make(image_bytes("PNG", mode="RGBA", color=(0, 0, 0, 0)), "logo.png")
    variant = asset.variants.get(name="w480", format="webp")
    assert Image.open(io.BytesIO(read_public(variant.key))).mode == "RGBA"


def test_cmyk_images_are_converted(s3_buckets):
    asset = make(image_bytes("JPEG", mode="CMYK", color=(0, 50, 100, 0)), "print.jpg")
    assert asset.status == MediaAsset.Status.READY


def test_lqip_is_a_small_inline_webp(s3_buckets):
    asset = make(image_bytes("JPEG"))
    prefix = "data:image/webp;base64,"
    assert asset.lqip.startswith(prefix)
    assert len(base64.b64decode(asset.lqip[len(prefix) :])) < 2000


def test_variant_keys_are_content_addressed_and_served_under_media(s3_buckets):
    asset = make(image_bytes("JPEG"))
    variant = asset.variants.first()
    assert variant.key.startswith(f"variants/{asset.pk}/")
    assert variant.url == f"/media/{variant.key}"


def test_watermark_is_applied_when_enabled(s3_buckets):
    plain = make(image_bytes("PNG", size=(1200, 800), color="#808080"), "a.png")
    WatermarkSetting.objects.update_or_create(pk=1, defaults={"enabled": True, "text": "© 3evda", "opacity": 0.9})
    marked = make(image_bytes("PNG", size=(1200, 800), color="#808081"), "b.png")

    assert not plain.watermarked and marked.watermarked
    img = Image.open(io.BytesIO(read_public(marked.variants.get(name="w1200", format="webp").key))).convert("RGB")
    corner = img.crop((900, 650, 1200, 800))
    assert max(abs(c - 128) for px in corner.get_flattened_data() for c in px) > 40  # text is visible in the corner


def test_reprocessing_replaces_variants_and_removes_old_objects(
    s3_buckets, settings, django_capture_on_commit_callbacks
):
    asset = make(image_bytes("JPEG"))
    old_keys = set(asset.variants.values_list("key", flat=True))
    WatermarkSetting.objects.update_or_create(pk=1, defaults={"enabled": True})

    with django_capture_on_commit_callbacks(execute=True):
        process_asset(str(asset.pk))

    new_keys = set(asset.variants.values_list("key", flat=True))
    assert new_keys and new_keys.isdisjoint(old_keys)
    listed = {o["Key"] for o in s3_buckets.list_objects_v2(Bucket=settings.S3_PUBLIC_BUCKET).get("Contents", [])}
    assert listed == new_keys


def test_processing_failure_is_recorded(s3_buckets, settings):
    asset, _ = create_asset(SimpleUploadedFile("a.jpg", image_bytes("JPEG")), user=None)
    s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=asset.original_key, Body=b"\xff\xd8\xffgarbage")

    process_asset(str(asset.pk))

    asset.refresh_from_db()
    assert asset.status == MediaAsset.Status.FAILED
    assert asset.error


def test_video_is_stripped_of_metadata_and_gets_a_poster(s3_buckets, tmp_path):
    asset = make(video_bytes(tmp_path, "mp4"), "clip.mp4")

    assert asset.status == MediaAsset.Status.READY, asset.error
    assert asset.kind == MediaAsset.Kind.VIDEO
    assert (asset.width, asset.height) == (320, 240)
    assert 1.5 < asset.duration_seconds < 2.5
    video = asset.variants.get(name="video", format="mp4")
    out = tmp_path / "out.mp4"
    out.write_bytes(read_public(video.key))
    probe = json.loads(
        subprocess.run(
            ["ffprobe", "-v", "error", "-print_format", "json", "-show_format", str(out)],  # noqa: S607
            capture_output=True,
            check=True,
            text=True,
        ).stdout
    )
    tags = {k.lower() for k in probe["format"].get("tags", {})}
    assert "location" not in tags and "title" not in tags
    assert asset.variants.filter(name__startswith="poster-", format="webp").exists()
    assert asset.lqip.startswith("data:image/webp;base64,")
