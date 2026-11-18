"""Turn the photos in promo/reel/photos/ into the reel's shot list (build/manifest.js + build/img/*.jpg).

- Put Sevda's photos (jpg/png/webp, any size) in promo/reel/photos/.
- Optional photos/shots.json picks which photo goes where and what word it carries (see README.md).
- With no photos at all, abstract placeholder plates (the same generator the site's sample content uses) fill every
  slot and the reel shows a "placeholder" tag, so a draft is never mistaken for the real thing.

The "before" frame of the hook is made here from the hook photo itself: washed-out, flat, tinted, tilted and noisy,
like a quick phone snap of the same dish.
"""

from __future__ import annotations

import importlib.util
import io
import json
import sys
from pathlib import Path

from PIL import Image, ImageEnhance, ImageFilter, ImageOps

ROOT = Path(__file__).resolve().parent.parent
PHOTOS = ROOT / "photos"
BUILD = ROOT / "build"
IMG = BUILD / "img"
REPO = ROOT.parent.parent

LONG_SIDE = 2000  # enough for a 1080x1920 frame with a punch-in zoom

# Words the montage cuts carry when shots.json does not say otherwise. Sensory, so they fit any photo.
WORDS = [
    ("نور", "LIGHT"),
    ("رنگ", "COLOUR"),
    ("بافت", "TEXTURE"),
    ("عطر", "AROMA"),
    ("طعم", "TASTE"),
    ("جزئیات", "DETAIL"),
    ("اصالت", "HERITAGE"),
    ("اشتها", "APPETITE"),
    ("لذت", "PLEASURE"),
    ("حس", "FEELING"),
]

# How many distinct photos each part of the reel wants (photos are reused when there are fewer).
SLOTS = {"hook": 1, "montage": 10, "break": 1, "drop": 4, "grid": 12, "site": 6, "cta": 1}


def placeholder_images(count: int) -> list[Image.Image]:
    spec = importlib.util.spec_from_file_location("sample_images", REPO / "backend/apps/samplecontent/images.py")
    mod = importlib.util.module_from_spec(spec)  # type: ignore[arg-type]
    spec.loader.exec_module(mod)  # type: ignore[union-attr]
    out = []
    for i in range(count):
        w, h = (1350, 2000) if i % 3 else (2000, 1500)
        out.append(Image.open(io.BytesIO(mod.make_image(1000 + i * 7, w, h))).convert("RGB"))
    return out


def load(path: Path) -> Image.Image:
    img = ImageOps.exif_transpose(Image.open(path)).convert("RGB")
    img.thumbnail((LONG_SIDE, LONG_SIDE), Image.Resampling.LANCZOS)
    return img


def background(img: Image.Image) -> Image.Image:
    """The frame behind a photo "print": the same photo, cover-cropped to 9:16, heavily blurred and darkened."""
    small = ImageOps.fit(img, (270, 480), Image.Resampling.LANCZOS)
    small = small.filter(ImageFilter.GaussianBlur(14))
    small = ImageEnhance.Brightness(small).enhance(0.55)
    small = ImageEnhance.Color(small).enhance(1.15)
    return small.resize((1080, 1920), Image.Resampling.BICUBIC)


def make_before(img: Image.Image) -> Image.Image:
    """A dull phone-snap version of the same dish: what the client has now."""
    w, h = img.size
    out = img.rotate(-4, resample=Image.Resampling.BICUBIC, expand=False, fillcolor=(120, 115, 105))
    out = out.crop((int(w * 0.04), int(h * 0.04), int(w * 0.96), int(h * 0.96))).resize((w, h))
    out = ImageEnhance.Color(out).enhance(0.45)
    out = ImageEnhance.Contrast(out).enhance(0.6)
    out = ImageEnhance.Brightness(out).enhance(1.12)
    # greenish-yellow fluorescent cast and lifted blacks
    r, g, b = out.split()
    r = r.point(lambda v: int(v * 0.93 + 18))
    g = g.point(lambda v: int(v * 0.97 + 22))
    b = b.point(lambda v: int(v * 0.78 + 10))
    out = Image.merge("RGB", (r, g, b))
    out = out.filter(ImageFilter.GaussianBlur(max(1, w // 700)))
    noise = Image.effect_noise((w, h), 40).convert("RGB")
    return Image.blend(out, noise, 0.07)


def main() -> None:
    IMG.mkdir(parents=True, exist_ok=True)
    for old in IMG.glob("*.jpg"):
        old.unlink()

    files = sorted(p for p in PHOTOS.glob("*") if p.suffix.lower() in {".jpg", ".jpeg", ".png", ".webp"} and not p.name.startswith("_"))
    placeholder = not files
    shots_cfg = {}
    if (PHOTOS / "shots.json").exists():
        shots_cfg = json.loads((PHOTOS / "shots.json").read_text(encoding="utf-8"))

    if placeholder:
        images = {f"placeholder-{i:02d}": im for i, im in enumerate(placeholder_images(16))}
    else:
        images = {p.stem: load(p) for p in files}
    names = list(images)

    saved: dict[str, dict] = {}
    for name, im in images.items():
        dest = IMG / f"{name}.jpg"
        im.save(dest, "JPEG", quality=92)
        background(im).save(IMG / f"{name}-bg.jpg", "JPEG", quality=85)
        saved[name] = {"src": f"img/{name}.jpg", "bg": f"img/{name}-bg.jpg", "w": im.width, "h": im.height}

    def pick(slot: str, n: int, offset: int) -> list[str]:
        chosen = shots_cfg.get(slot)
        if chosen:
            chosen = [c if isinstance(c, str) else c["photo"] for c in chosen]
            missing = [c for c in chosen if Path(c).stem not in saved]
            if missing:
                sys.exit(f"shots.json '{slot}' names photos that are not in photos/: {missing}")
            return [Path(c).stem for c in chosen]
        return [names[(offset + i) % len(names)] for i in range(n)]

    if placeholder:
        shots_cfg = {}

    hook = pick("hook", 1, 0)[0]
    before = make_before(images[hook])
    before.save(IMG / "before.jpg", "JPEG", quality=88)
    background(before).save(IMG / "before-bg.jpg", "JPEG", quality=85)
    saved["before"] = {"src": "img/before.jpg", "bg": "img/before-bg.jpg", "w": before.width, "h": before.height}

    words = shots_cfg.get("words") or WORDS
    montage = pick("montage", SLOTS["montage"], 1)
    manifest = {
        "placeholder": placeholder,
        "photos": saved,
        "hook": hook,
        "montage": [{"photo": p, "fa": words[i % len(words)][0], "en": words[i % len(words)][1]} for i, p in enumerate(montage)],
        "break": pick("break", 1, 11)[0],
        "drop": pick("drop", SLOTS["drop"], 12),
        "grid": pick("grid", SLOTS["grid"], 0),
        "site": pick("site", SLOTS["site"], 3),
        "cta": pick("cta", 1, 0)[0],
        "services": shots_cfg.get("services"),
        "contact": {
            "site": "3evda.com",
            "instagram": "@3evda.r",
            **shots_cfg.get("contact", {}),
        },
    }
    (BUILD / "manifest.js").write_text("window.MANIFEST = " + json.dumps(manifest, ensure_ascii=False, indent=1) + ";\n", encoding="utf-8")
    kind = "placeholder" if placeholder else "real"
    print(f"{len(images)} {kind} photos -> build/manifest.js")


if __name__ == "__main__":
    main()
