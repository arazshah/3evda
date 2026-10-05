"""Sample photographs drawn with Pillow: a plate and garnish on a coloured surface, soft light, vignette and grain.

They are abstract on purpose (no real photo is imitated), deterministic for a given seed, and need no network.
"""

from __future__ import annotations

import io
import math
import random

from PIL import Image, ImageChops, ImageDraw, ImageFilter

# (surface light, surface dark, plate, food, garnish) — warm, editorial colours that read well in both themes.
PALETTES: list[tuple[str, str, str, str, str]] = [
    ("#d9c3a5", "#8a6a4a", "#f3eee6", "#b5472a", "#4f6b3a"),
    ("#2b2f33", "#0f1113", "#d8d4cc", "#c98a3b", "#7aa05b"),
    ("#e8d6c8", "#b88e78", "#fbf8f3", "#8c2f2a", "#e0b84a"),
    ("#c9d4cf", "#6f8780", "#f6f4ef", "#d96b3c", "#355e3b"),
    ("#e9e2d3", "#a89878", "#2d2a27", "#e1a948", "#7b3b2a"),
    ("#3a2c28", "#150f0d", "#e7ddd0", "#a33b2c", "#c8b560"),
    ("#f0d9cf", "#c9958a", "#ffffff", "#7a3a46", "#e8c9a0"),
    ("#cfd8dc", "#78909c", "#fafafa", "#e07a3f", "#4f7a4b"),
]


def _rgb(value: str) -> tuple[int, int, int]:
    value = value.lstrip("#")
    return int(value[0:2], 16), int(value[2:4], 16), int(value[4:6], 16)


def _mix(a: tuple[int, int, int], b: tuple[int, int, int], t: float) -> tuple[int, int, int]:
    return tuple(round(a[i] + (b[i] - a[i]) * t) for i in range(3))  # type: ignore[return-value]


def _surface(
    size: tuple[int, int], light: tuple[int, int, int], dark: tuple[int, int, int], rnd: random.Random
) -> Image.Image:
    w, h = size
    # A diagonal light falloff on a tiny canvas, enlarged: smooth and cheap.
    small = Image.new("RGB", (64, 64))
    px = small.load()
    angle = rnd.uniform(0.0, math.tau)
    for y in range(64):
        for x in range(64):
            t = ((x / 63 - 0.5) * math.cos(angle) + (y / 63 - 0.5) * math.sin(angle)) + 0.5
            px[x, y] = _mix(light, dark, min(1.0, max(0.0, t)))  # type: ignore[index]
    return small.resize((w, h), Image.Resampling.BICUBIC)


def _blob(
    draw: ImageDraw.ImageDraw, cx: float, cy: float, r: float, fill: tuple[int, int, int], rnd: random.Random
) -> None:
    points = []
    steps = 28
    for i in range(steps):
        a = i / steps * math.tau
        k = r * (1 + rnd.uniform(-0.18, 0.18))
        points.append((cx + math.cos(a) * k, cy + math.sin(a) * k))
    draw.polygon(points, fill=fill)


def make_image(seed: int, width: int, height: int) -> bytes:
    """A JPEG of `width` x `height`; the same seed always gives the same picture."""
    rnd = random.Random(seed)  # noqa: S311  (a picture, not a secret)
    light, dark, plate, food, garnish = (_rgb(c) for c in PALETTES[seed % len(PALETTES)])
    img = _surface((width, height), light, dark, rnd)

    base = min(width, height)
    cx = width * rnd.uniform(0.38, 0.62)
    cy = height * rnd.uniform(0.40, 0.62)
    radius = base * rnd.uniform(0.26, 0.36)

    # Soft shadow under the plate, offset away from the light.
    shadow = Image.new("L", (width, height), 0)
    ImageDraw.Draw(shadow).ellipse(
        (cx - radius + base * 0.03, cy - radius + base * 0.05, cx + radius + base * 0.05, cy + radius + base * 0.07),
        fill=150,
    )
    shadow = shadow.filter(ImageFilter.GaussianBlur(base * 0.035))
    img = Image.composite(Image.new("RGB", (width, height), (0, 0, 0)), img, shadow.point(lambda v: v * 0.55))

    draw = ImageDraw.Draw(img)
    draw.ellipse((cx - radius, cy - radius, cx + radius, cy + radius), fill=plate)
    rim = _mix(plate, dark, 0.25)
    draw.ellipse(
        (cx - radius * 0.84, cy - radius * 0.84, cx + radius * 0.84, cy + radius * 0.84),
        outline=rim,
        width=max(2, round(base * 0.004)),
    )

    # The food: a main mound and a few smaller pieces.
    _blob(draw, cx, cy, radius * rnd.uniform(0.38, 0.52), food, rnd)
    for _ in range(rnd.randint(3, 6)):
        a = rnd.uniform(0, math.tau)
        d = radius * rnd.uniform(0.15, 0.55)
        _blob(
            draw,
            cx + math.cos(a) * d,
            cy + math.sin(a) * d,
            radius * rnd.uniform(0.08, 0.17),
            _mix(food, plate, rnd.uniform(0.0, 0.35)),
            rnd,
        )
    for _ in range(rnd.randint(8, 18)):
        a = rnd.uniform(0, math.tau)
        d = radius * rnd.uniform(0.05, 0.62)
        r = radius * rnd.uniform(0.02, 0.05)
        x, y = cx + math.cos(a) * d, cy + math.sin(a) * d
        draw.ellipse((x - r, y - r, x + r, y + r), fill=garnish)

    # A second, partly visible object (cup, bowl or board) for variety.
    ox = width * rnd.choice([0.1, 0.9]) + rnd.uniform(-0.04, 0.04) * width
    oy = height * rnd.uniform(0.2, 0.85)
    orad = base * rnd.uniform(0.10, 0.17)
    draw.ellipse((ox - orad, oy - orad, ox + orad, oy + orad), fill=_mix(garnish, dark, 0.35))
    draw.ellipse((ox - orad * 0.7, oy - orad * 0.7, ox + orad * 0.7, oy + orad * 0.7), fill=_mix(food, light, 0.3))

    img = img.filter(ImageFilter.GaussianBlur(base * 0.0012))

    # Vignette and grain finish it like a film frame.
    mask = Image.new("L", (64, 64), 0)
    ImageDraw.Draw(mask).ellipse((-14, -14, 78, 78), fill=255)
    mask = mask.resize((width, height), Image.Resampling.BICUBIC).filter(ImageFilter.GaussianBlur(base * 0.05))
    img = Image.composite(img, ImageChops.multiply(img, Image.new("RGB", (width, height), (150, 140, 135))), mask)
    noise = Image.effect_noise((width, height), 14).convert("RGB")
    img = Image.blend(img, ImageChops.overlay(img, noise), 0.12)

    out = io.BytesIO()
    img.save(out, "JPEG", quality=86, optimize=True)
    return out.getvalue()
