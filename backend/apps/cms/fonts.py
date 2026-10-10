"""The Persian typefaces the owner can pick in the site settings.

Self-hosted (fontsource), so no visitor's browser calls a third-party server. Only faces that carry the whole Persian
alphabet (پ چ ژ گ ک ی) and the Persian digits are listed; Tajawal and similar Arabic-only faces are left out on purpose.
The keys are mirrored in `frontend/src/lib/fonts.ts` (a type check there fails when they drift apart).
"""

DEFAULT_FONT = "vazirmatn"

HEADING_FONTS: list[tuple[str, str]] = [
    ("vazirmatn", "وزیرمتن (پیش‌فرض)"),
    ("noto-sans", "نوتو سنس عربی"),
    ("ibm-plex", "آی‌بی‌ام پلکس عربی"),
    ("cairo", "قاهره"),
    ("noto-naskh", "نوتو نسخ"),
    ("amiri", "امیری"),
    ("harmattan", "هارماتان"),
    ("almarai", "المرعی"),
    ("lalezar", "لاله‌زار (فقط تیتر)"),
]

# A display face is too heavy to read paragraphs in, so it is offered for headings only.
BODY_FONTS: list[tuple[str, str]] = [f for f in HEADING_FONTS if f[0] != "lalezar"]
