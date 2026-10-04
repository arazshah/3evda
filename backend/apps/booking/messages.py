"""Messages the customer can see, in the language of the page they used."""

MESSAGES: dict[str, dict[str, str]] = {
    "slot_taken": {
        "fa": "این ساعت دیگر آزاد نیست؛ لطفاً ساعت دیگری انتخاب کنید.",
        "en": "That time is no longer available; please choose another.",
    },
    "type_unavailable": {
        "fa": "این نوع جلسه در دسترس نیست.",
        "en": "This kind of session is not available.",
    },
    "too_late": {
        "fa": "زمان لغو گذشته است؛ لطفاً مستقیم تماس بگیرید.",
        "en": "It is too late to cancel online; please get in touch directly.",
    },
    "not_cancellable": {
        "fa": "این رزرو دیگر قابل لغو نیست.",
        "en": "This booking can no longer be cancelled.",
    },
    "contact_required": {
        "fa": "دست‌کم یکی از راه‌های تماس (تلفن، واتس‌اپ، تلگرام یا ایمیل) را وارد کنید.",
        "en": "Enter at least one way to reach you (phone, WhatsApp, Telegram or email).",
    },
    "phone_invalid": {"fa": "شماره‌ی تلفن معتبر نیست.", "en": "The phone number is not valid."},
    "range_too_long": {
        "fa": "بازه‌ی تاریخ بیش از ۶۲ روز است.",
        "en": "The date range is longer than 62 days.",
    },
}


def t(key: str, language: str) -> str:
    entry = MESSAGES[key]
    return entry.get(language) or entry["fa"]
