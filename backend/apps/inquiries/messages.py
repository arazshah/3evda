"""Messages the visitor can see, in the language of the page they submitted from."""

MESSAGES: dict[str, dict[str, str]] = {
    "phone_invalid": {"fa": "شماره‌ی تلفن معتبر نیست.", "en": "The phone number is not valid."},
    "contact_required": {
        "fa": "دست‌کم یکی از راه‌های تماس (تلفن، واتس‌اپ، تلگرام یا ایمیل) را وارد کنید.",
        "en": "Enter at least one way to reach you (phone, WhatsApp, Telegram or email).",
    },
    "quantity_required": {"fa": "تعداد محصول را وارد کنید.", "en": "Enter the number of products."},
    "too_many": {"fa": "حداکثر ۳ فایل می‌توانید پیوست کنید.", "en": "You can attach at most 3 files."},
    "too_large": {
        "fa": "حجم هر فایل باید کمتر از ۱۰ مگابایت باشد.",
        "en": "Each file must be smaller than 10 MB.",
    },
    "request_too_large": {"fa": "حجم فایل‌ها بیش از حد مجاز است.", "en": "The files are too large."},
    "unsupported": {
        "fa": "فقط تصویر (JPEG، PNG، WebP) و فایل PDF پذیرفته می‌شود.",
        "en": "Only images (JPEG, PNG, WebP) and PDF files are accepted.",
    },
    "empty": {"fa": "فایل خالی است.", "en": "The file is empty."},
}


def t(key: str, language: str) -> str:
    entry = MESSAGES[key]
    return entry.get(language) or entry["fa"]
