"""In-memory test files. Nothing here is real personal data."""

import hashlib
import io
import shutil
import subprocess
from pathlib import Path

from PIL import Image, TiffImagePlugin

from apps.media.models import MediaAsset, MediaVariant

GPS_IFD = 0x8825
ORIENTATION = 0x0112
ARTIST = 0x013B
COPYRIGHT = 0x8298


def image_bytes(
    fmt: str = "JPEG",
    size: tuple[int, int] = (1200, 800),
    mode: str = "RGB",
    color: str | tuple[int, ...] = "#c9822c",
    gps: bool = False,
    orientation: int | None = None,
) -> bytes:
    img = Image.new(mode, size, color)
    exif = Image.Exif()
    if gps:
        exif[0x010F] = "PhoneMaker"
        gps_ifd = {1: "N", 2: (35.0, 41.0, 21.0), 3: "E", 4: (51.0, 23.0, 20.0)}
        exif[GPS_IFD] = gps_ifd
    if orientation:
        exif[ORIENTATION] = orientation
    buf = io.BytesIO()
    kwargs = {"exif": exif.tobytes()} if (gps or orientation) and fmt in ("JPEG", "WEBP", "PNG") else {}
    img.save(buf, fmt, **kwargs)
    return buf.getvalue()


def has_gps(data: bytes) -> bool:
    exif = Image.open(io.BytesIO(data)).getexif()
    return GPS_IFD in exif and bool(exif.get_ifd(GPS_IFD))


def exif_tags(data: bytes) -> set[int]:
    return set(Image.open(io.BytesIO(data)).getexif().keys())


def video_bytes(tmp_path: Path, container: str = "mp4", seconds: int = 2) -> bytes:
    if not shutil.which("ffmpeg"):
        raise RuntimeError("ffmpeg is required for video tests")
    out = tmp_path / f"sample.{container}"
    codec = ["-c:v", "mpeg4"] if container == "mp4" else ["-c:v", "libvpx", "-b:v", "200k"]
    subprocess.run(
        [  # noqa: S607
            "ffmpeg",
            "-v",
            "error",
            "-y",
            "-f",
            "lavfi",
            "-i",
            f"testsrc=size=320x240:rate=10:duration={seconds}",
            *codec,
            "-metadata",
            "location=+35.6892+051.3890/",
            "-metadata",
            "title=private title",
            str(out),
        ],
        check=True,
        timeout=60,
    )
    return out.read_bytes()


__all__ = ["TiffImagePlugin"]


def make_asset(name: str = "a", status: str = MediaAsset.Status.READY) -> MediaAsset:
    asset = MediaAsset.objects.create(
        kind="image", status=status, original_key=f"originals/{name}.jpg", original_filename=f"{name}.jpg",
        mime="image/jpeg", size_bytes=10, sha256=hashlib.sha256(name.encode()).hexdigest(), width=1200, height=800,
        alt_fa="متن", alt_en="text",
    )  # fmt: skip
    MediaVariant.objects.create(
        asset=asset, name="w480", format="webp", key=f"v/{name}.webp", width=480, height=320, size_bytes=5
    )
    return asset
