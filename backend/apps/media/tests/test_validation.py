import io

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.media.validation import UploadRejected, inspect_upload

from .factories import image_bytes, video_bytes


def upload(data: bytes, name: str = "photo.jpg") -> SimpleUploadedFile:
    return SimpleUploadedFile(name, data)


@pytest.mark.parametrize(
    ("fmt", "mime", "ext"),
    [
        ("JPEG", "image/jpeg", ".jpg"),
        ("PNG", "image/png", ".png"),
        ("WEBP", "image/webp", ".webp"),
        ("AVIF", "image/avif", ".avif"),
        ("TIFF", "image/tiff", ".tiff"),
    ],
)
def test_supported_images_are_detected_from_content(fmt, mime, ext):
    info = inspect_upload(upload(image_bytes(fmt), "whatever.bin"))
    assert (info.kind, info.mime, info.ext) == ("image", mime, ext)
    assert (info.width, info.height) == (1200, 800)


def test_extension_is_ignored_in_favour_of_content():
    info = inspect_upload(upload(image_bytes("PNG"), "photo.jpg"))
    assert info.mime == "image/png"


@pytest.mark.parametrize(
    ("data", "name"),
    [
        (b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>", "x.svg"),
        (b"<!doctype html><script>alert(1)</script>", "x.jpg"),
        (b"%PDF-1.7\n", "x.pdf"),
        (b"GIF89a" + b"\0" * 32, "x.gif"),
        (b"", "empty.jpg"),
    ],
)
def test_unsupported_content_is_rejected(data, name):
    with pytest.raises(UploadRejected) as exc:
        inspect_upload(upload(data, name))
    assert exc.value.code in {"unsupported_type", "empty"}


def test_corrupt_image_is_rejected():
    data = image_bytes("JPEG")[:200]
    with pytest.raises(UploadRejected) as exc:
        inspect_upload(upload(data))
    assert exc.value.code == "invalid_image"


def test_too_large_image_is_rejected(settings):
    settings.MEDIA_MAX_IMAGE_BYTES = 1000
    with pytest.raises(UploadRejected) as exc:
        inspect_upload(upload(image_bytes("JPEG")))
    assert exc.value.code == "too_large"


def test_decompression_bomb_is_rejected(settings):
    settings.MEDIA_MAX_PIXELS = 1_000_000
    data = image_bytes("PNG", size=(4000, 4000), mode="1", color=0)  # tiny file, 16 MP
    assert len(data) < 100_000
    with pytest.raises(UploadRejected) as exc:
        inspect_upload(upload(data, "bomb.png"))
    assert exc.value.code == "too_many_pixels"


def test_mp4_and_webm_are_detected(tmp_path):
    assert inspect_upload(upload(video_bytes(tmp_path, "mp4"), "v.bin")).mime == "video/mp4"
    assert inspect_upload(upload(video_bytes(tmp_path, "webm"), "v.bin")).mime == "video/webm"


def test_too_large_video_is_rejected(tmp_path, settings):
    settings.MEDIA_MAX_VIDEO_BYTES = 100
    with pytest.raises(UploadRejected) as exc:
        inspect_upload(upload(video_bytes(tmp_path, "mp4"), "v.mp4"))
    assert exc.value.code == "too_large"


def test_the_upload_is_rewound_after_inspection():
    f = upload(image_bytes("JPEG"))
    inspect_upload(f)
    assert f.tell() == 0
    assert io.BytesIO(f.read()).getbuffer().nbytes > 0
