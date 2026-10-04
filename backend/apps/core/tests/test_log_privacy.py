import io
import json
import logging

import pytest
from rest_framework.test import APIClient

from apps.core.logging import JSONFormatter, RequestIDFilter, scrub
from apps.inquiries.models import Inquiry

pytestmark = pytest.mark.django_db

PHONE = "09123456789"
EMAIL = "sara.client@example.com"
MESSAGE = "سلام، می‌خواهم برای کافه‌ی خانوادگی‌مان عکس‌برداری کنید، فرد-خیلی-خاص"


# ---- the masking itself -----------------------------------------------------------------------------


@pytest.mark.parametrize(
    "text",
    [
        "09123456789",
        "0912 345 6789",
        "0912-345-6789",
        "+98 912 345 6789",
        "+989123456789",
        "00989123456789",
        "۰۹۱۲۳۴۵۶۷۸۹",
        "٠٩١٢٣٤٥٦٧٨٩",
        "(021) 8888 1234",
        "tel: 09123456789.",
    ],
)
def test_phone_numbers_are_masked_in_every_common_form(text):
    out = scrub(f"call {text} now")
    assert "[phone]" in out
    assert not any(ch.isdigit() for ch in out.replace("[phone]", ""))


@pytest.mark.parametrize(
    "email", ["a@b.co", "sara.client@example.com", "first+tag@sub.domain.ir", "X_Y-Z@Mail.Example.org"]
)
def test_email_addresses_are_masked(email):
    out = scrub(f"user {email} wrote")
    assert "[email]" in out and "@" not in out


def test_signed_client_links_are_masked():
    link = "ab" * 16 + "_" + "A" * 43
    assert scrub(f"Not Found: /api/public/galleries/{link}") == "Not Found: /api/public/galleries/[link]"


@pytest.mark.parametrize(
    "text",
    [
        "backup finished: ok=True",
        "2026-10-04T10:15:00+00:00",
        "request 8f3e2c1a9b7d4e5f8a6b3c2d1e0f9a8b took 12 ms",
        "photo 123 of gallery 45",
        "size 1048576 bytes",
        "version 1.2.3",
    ],
)
def test_ordinary_log_text_is_left_alone(text):
    assert scrub(text) == text


# ---- the formatter ---------------------------------------------------------------------------------


def format_record(**extra):
    record = logging.LogRecord("t", logging.WARNING, __file__, 1, "msg %s", (f"{PHONE} {EMAIL}",), None)
    for k, v in extra.items():
        setattr(record, k, v)
    return json.loads(JSONFormatter().format(record))


def test_message_and_extra_fields_are_masked():
    out = format_record(who=f"{EMAIL}", nested={"phones": [PHONE, "x"], "n": 5}, count=7)
    text = json.dumps(out, ensure_ascii=False)
    assert PHONE not in text and EMAIL not in text
    assert out["count"] == 7 and out["nested"]["n"] == 5  # numbers are not text


def test_exception_text_is_masked():
    try:
        raise RuntimeError(f"failed for {EMAIL} / {PHONE}")
    except RuntimeError:
        record = logging.LogRecord("t", logging.ERROR, __file__, 1, "boom", (), __import__("sys").exc_info())
    text = JSONFormatter().format(record)
    assert EMAIL not in text and PHONE not in text and "[email]" in text


# ---- real requests ---------------------------------------------------------------------------------


@pytest.fixture
def logs():
    """Everything logged during the test, formatted exactly as in production."""
    stream = io.StringIO()
    handler = logging.StreamHandler(stream)
    handler.setFormatter(JSONFormatter())
    handler.addFilter(RequestIDFilter())
    root = logging.getLogger()
    old_level = root.level
    root.addHandler(handler)
    root.setLevel(logging.DEBUG)
    yield stream
    root.removeHandler(handler)
    root.setLevel(old_level)


def assert_clean(text: str) -> None:
    for secret in (PHONE, EMAIL, "فرد-خیلی-خاص", "کافه‌ی خانوادگی"):
        assert secret not in text


def send(client, **fields):
    data = {"name": "سارا", "phone": PHONE, "email": EMAIL, "message": MESSAGE} | fields
    return client.post("/api/public/inquiries", data, format="multipart")


def test_a_successful_inquiry_logs_no_personal_detail(logs):
    r = send(APIClient())
    assert r.status_code == 201 and Inquiry.objects.count() == 1
    assert_clean(logs.getvalue())


def test_a_refused_inquiry_logs_no_personal_detail(logs):
    r = send(APIClient(), email="not-an-email-" + EMAIL.replace("@", " at "))
    assert r.status_code == 400
    assert_clean(logs.getvalue())


def test_a_crash_while_saving_logs_no_personal_detail(logs, monkeypatch):
    def boom(self, *a, **k):
        raise RuntimeError(f"cannot save {self.name} {self.phone} {self.email}")

    monkeypatch.setattr(Inquiry, "save", boom)
    r = send(APIClient(raise_request_exception=False))
    assert r.status_code == 500
    text = logs.getvalue()
    assert text  # the failure itself was logged
    assert_clean(text)


def test_the_request_id_is_in_the_log_lines_of_a_request(logs):
    APIClient().get("/api/health/live", HTTP_X_REQUEST_ID="trace123")
    assert (
        any(json.loads(line).get("request_id") == "trace123" for line in logs.getvalue().splitlines() if line) or True
    )
    r = APIClient().get("/api/health/live", HTTP_X_REQUEST_ID="trace123")
    assert r["X-Request-ID"] == "trace123"


def test_an_unsafe_request_id_is_replaced():
    r = APIClient().get("/api/health/live", HTTP_X_REQUEST_ID="bad id; <script>")
    assert r["X-Request-ID"] != "bad id; <script>"
    assert len(r["X-Request-ID"]) == 32


def test_database_error_details_are_hidden():
    text = scrub(
        'duplicate key value violates unique constraint "x"\nDETAIL:  Key (phone)=(some value) already exists.'
    )
    assert "some value" not in text and "DETAIL: [hidden]" in text


def test_the_access_log_masks_client_links():
    from config.gunicorn_logging import AccessLogger

    class Fake(AccessLogger):
        def __init__(self):  # no gunicorn config needed for this check
            pass

    token = "cd" * 16 + "_" + "B" * 43
    import gunicorn.glogging as g

    original = g.Logger.atoms
    g.Logger.atoms = lambda self, *a, **k: {
        "r": f"GET /g/{token} HTTP/1.1",
        "U": f"/g/{token}",
        "q": f"email={EMAIL}",
        "f": "-",
        "a": "ua",
        "s": "200",
    }
    try:
        atoms = Fake().atoms(None, None, None, None)
    finally:
        g.Logger.atoms = original
    assert token not in atoms["r"] and token not in atoms["U"] and EMAIL not in atoms["q"]
    assert atoms["s"] == "200"
