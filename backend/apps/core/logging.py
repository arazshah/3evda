import json
import logging
import re
from contextvars import ContextVar
from datetime import UTC, datetime
from typing import Any

request_id_var: ContextVar[str] = ContextVar("request_id", default="-")

_STANDARD_ATTRS = set(vars(logging.makeLogRecord({}))) | {"message", "asctime", "request_id"}


_EMAIL = re.compile(r"[A-Za-z0-9._%+-]+@[A-Za-z0-9-]+(?:\.[A-Za-z0-9-]+)*\.[A-Za-z]{2,}")
_PHONE = re.compile(r"(?<![\w.])[+(]?\d[\d\s().-]{7,}\d(?!\w)")
_LINK = re.compile(r"[0-9a-f]{32}_[A-Za-z0-9_-]{20,}")  # the signed links given to clients (proforma, booking, gallery)
_DB_DETAIL = re.compile(
    r"DETAIL:[^\n]*"
)  # database errors quote the offending values: "Key (phone)=(0912…) already exists"
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
MIN_PHONE_DIGITS = 10


def scrub(text: str) -> str:
    """Keeps personal details and client links out of the logs: e-mail addresses, phone numbers (also in
    Persian digits) and signed links are replaced by a marker. Free text typed by a visitor cannot be
    recognised this way, so nothing logs it in the first place; this is the safety net for what slips through."""
    text = _DB_DETAIL.sub("DETAIL: [hidden]", text)
    text = _LINK.sub("[link]", text)
    text = _EMAIL.sub("[email]", text)
    normalised = text.translate(_DIGITS)

    def phone(match: re.Match[str]) -> str:
        digits = sum(ch.isdigit() for ch in match.group(0))
        return "[phone]" if digits >= MIN_PHONE_DIGITS else match.group(0)

    # Digits are normalised only to decide *whether* something is a phone number; the replacement is applied
    # to the original text at the same positions (the translation keeps every character's position).
    out, last = [], 0
    for match in _PHONE.finditer(normalised):
        replacement = phone(match)
        if replacement == "[phone]":
            out.append(text[last : match.start()])
            out.append(replacement)
            last = match.end()
    out.append(text[last:])
    return "".join(out)


def scrub_value(value: Any) -> Any:
    if isinstance(value, str):
        return scrub(value)
    if isinstance(value, dict):
        return {k: scrub_value(v) for k, v in value.items()}
    if isinstance(value, list | tuple):
        return [scrub_value(v) for v in value]
    return value


class RequestIDFilter(logging.Filter):
    def filter(self, record: logging.LogRecord) -> bool:
        record.request_id = request_id_var.get()
        return True


class JSONFormatter(logging.Formatter):
    def format(self, record: logging.LogRecord) -> str:
        payload = {
            "ts": datetime.fromtimestamp(record.created, UTC).isoformat(),
            "level": record.levelname,
            "logger": record.name,
            "msg": scrub(record.getMessage()),
            "request_id": getattr(record, "request_id", "-"),
        }
        payload.update({k: scrub_value(v) for k, v in vars(record).items() if k not in _STANDARD_ATTRS})
        if record.exc_info:
            payload["exc"] = scrub(self.formatException(record.exc_info))
        return json.dumps(payload, ensure_ascii=False, default=str)
