"""Pure image transforms: normalise, resize, watermark and encode. No storage or database access."""

import base64
import io
from dataclasses import dataclass
from pathlib import Path
from typing import Any

from django.conf import settings
from PIL import Image, ImageCms, ImageDraw, ImageFont, ImageOps

from .models import WatermarkSetting

FONT_PATH = Path(__file__).parent / "assets" / "Vazirmatn-Bold.ttf"
EXIF_ARTIST = 0x013B
EXIF_COPYRIGHT = 0x8298
ENCODERS: dict[str, dict[str, str | int]] = {
    "webp": {"format": "WEBP", "quality": 82, "method": 4},
    "avif": {"format": "AVIF", "quality": 60, "speed": 6},
}


@dataclass(frozen=True)
class Rendition:
    name: str
    format: str
    data: bytes
    width: int
    height: int


def load_normalized(data: bytes) -> Image.Image:
    """Decode, apply EXIF orientation and convert to sRGB (RGB or RGBA). Drops all metadata."""
    img: Image.Image = Image.open(io.BytesIO(data))
    img = ImageOps.exif_transpose(img)
    icc = img.info.get("icc_profile")
    has_alpha = img.mode in ("RGBA", "LA", "PA") or (img.mode == "P" and "transparency" in img.info)
    target = "RGBA" if has_alpha else "RGB"
    if icc and img.mode in ("RGB", "RGBA", "CMYK"):
        try:
            src = ImageCms.ImageCmsProfile(io.BytesIO(icc))
            dst = ImageCms.createProfile("sRGB")
            converted = ImageCms.profileToProfile(img, src, dst, outputMode="RGBA" if img.mode == "RGBA" else "RGB")
            if converted is not None:
                img = converted
        except ImageCms.PyCMSError:
            pass  # a broken embedded profile is ignored rather than failing the upload
    img = img.convert(target)
    img.info.clear()
    return img


def target_widths(width: int) -> list[int]:
    widths = [w for w in settings.MEDIA_IMAGE_WIDTHS if w < width]
    widths.append(min(width, max(settings.MEDIA_IMAGE_WIDTHS)))
    return sorted(set(widths))


def fit_long_edge(img: Image.Image, edge: int) -> Image.Image:
    """Scale so that the longer side is at most `edge` (portrait and landscape alike)."""
    longest = max(img.size)
    if edge >= longest:
        return img.copy()
    ratio = edge / longest
    size = (max(1, round(img.width * ratio)), max(1, round(img.height * ratio)))
    return img.resize(size, Image.Resampling.LANCZOS, reducing_gap=3.0)


def resize(img: Image.Image, width: int) -> Image.Image:
    if width >= img.width:
        return img.copy()
    height = max(1, round(img.height * width / img.width))
    return img.resize((width, height), Image.Resampling.LANCZOS, reducing_gap=3.0)


def apply_watermark(img: Image.Image, setting: WatermarkSetting) -> Image.Image:
    base = img.convert("RGBA")
    size = max(12, round(base.width * setting.size_ratio))
    font = ImageFont.truetype(str(FONT_PATH), size, layout_engine=ImageFont.Layout.RAQM)
    overlay = Image.new("RGBA", base.size, (0, 0, 0, 0))
    draw = ImageDraw.Draw(overlay)
    left, top, right, bottom = draw.textbbox((0, 0), setting.text, font=font)
    tw, th = right - left, bottom - top
    margin = size
    positions = {
        "bottom_right": (base.width - tw - margin, base.height - th - margin),
        "bottom_left": (margin, base.height - th - margin),
        "top_right": (base.width - tw - margin, margin),
        "top_left": (margin, margin),
        "center": ((base.width - tw) // 2, (base.height - th) // 2),
    }
    x, y = positions.get(setting.position, positions["bottom_right"])
    alpha = round(255 * setting.opacity)
    shadow = max(1, size // 18)
    draw.text((x - left + shadow, y - top + shadow), setting.text, font=font, fill=(0, 0, 0, alpha // 2))
    draw.text((x - left, y - top), setting.text, font=font, fill=(255, 255, 255, alpha))
    out = Image.alpha_composite(base, overlay)
    return out if img.mode == "RGBA" else out.convert("RGB")


def copyright_exif() -> bytes:
    exif = Image.Exif()
    exif[EXIF_ARTIST] = settings.MEDIA_ARTIST
    exif[EXIF_COPYRIGHT] = settings.MEDIA_COPYRIGHT
    return exif.tobytes()


def encode(img: Image.Image, fmt: str, *, exif: bool = True) -> bytes:
    buf = io.BytesIO()
    params: dict[str, Any] = dict(ENCODERS[fmt])
    pil_format = str(params.pop("format"))
    if exif:
        params["exif"] = copyright_exif()
    img.save(buf, pil_format, **params)
    return buf.getvalue()


def renditions(img: Image.Image, watermark: WatermarkSetting | None, prefix: str = "") -> list[Rendition]:
    out = []
    for width in target_widths(img.width):
        resized = resize(img, width)
        if watermark is not None:
            resized = apply_watermark(resized, watermark)
        for fmt in ENCODERS:
            out.append(Rendition(f"{prefix}w{width}", fmt, encode(resized, fmt), resized.width, resized.height))
    return out


def lqip(img: Image.Image) -> str:
    small = resize(img, 24)
    buf = io.BytesIO()
    small.save(buf, "WEBP", quality=30)
    return "data:image/webp;base64," + base64.b64encode(buf.getvalue()).decode()
