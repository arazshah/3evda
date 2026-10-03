import csv
import io
from decimal import Decimal
from urllib.parse import parse_qs, urlsplit

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management import call_command
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.inquiries import attachments
from apps.inquiries.exports import safe_cell
from apps.inquiries.models import Inquiry, InquiryAttachment
from apps.media.tests.factories import image_bytes
from apps.pricing.models import QuoteRule

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _roomy_rate_limit(monkeypatch):
    """Most tests send many requests from one address; the rate-limit test sets its own small limit."""
    from rest_framework.throttling import ScopedRateThrottle

    rates = {**ScopedRateThrottle.THROTTLE_RATES, "inquiry": "1000/min"}
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", rates)


PUBLIC = "/api/public/inquiries"
ADMIN = "/api/admin/inquiries/"
PDF = b"%PDF-1.4\n1 0 obj<<>>endobj\ntrailer<<>>\n%%EOF\n"


def seed_rules():
    QuoteRule.objects.create(key="food", kind="service", label_fa="غذا", label_en="Food", amount=1_000_000, position=0)
    QuoteRule.objects.create(key="video", kind="addon_fixed", label_fa="ویدیو", amount=2_000_000, position=1)
    QuoteRule.objects.create(key="urgent", kind="multiplier", label_fa="فوری", factor=Decimal("1.5"), position=2)


def send(client, **fields):
    data = {"name": "علی", "phone": "09120000000"} | fields
    return client.post(PUBLIC, data, format="multipart")


def make(**kwargs):
    return Inquiry.objects.create(**{"name": "نمونه", "phone": "0912"} | kwargs)


def file(name, content, content_type="application/octet-stream"):
    return SimpleUploadedFile(name, content, content_type=content_type)


# ---- visitors --------------------------------------------------------------------------------------


def test_an_inquiry_is_stored_with_the_estimate_and_labels_the_visitor_saw(client):
    seed_rules()
    response = send(
        client, service="food", quantity=4, addons=["video"], multipliers=["urgent"], brand="کافه", message="سلام"
    )
    assert response.status_code == 201
    assert response.json() == {"received": True}  # nothing about the stored row is revealed
    assert response["Cache-Control"] == "no-store"

    inquiry = Inquiry.objects.get()
    assert (inquiry.name, inquiry.brand, inquiry.message, inquiry.status) == ("علی", "کافه", "سلام", "new")
    assert (inquiry.service_key, inquiry.service_label, inquiry.quantity) == ("food", "غذا", 4)
    assert (inquiry.estimate_low, inquiry.estimate_high) == (7_650_000, 10_350_000)  # (4M + 2M) × 1.5 ± 15 %
    assert inquiry.options == {
        "addons": [{"key": "video", "label": "ویدیو"}],
        "multipliers": [{"key": "urgent", "label": "فوری"}],
    }


def test_later_rule_changes_do_not_rewrite_an_old_inquiry(client):
    seed_rules()
    send(client, service="food", quantity=1)
    QuoteRule.objects.filter(key="food").update(amount=9_000_000)
    inquiry = Inquiry.objects.get()
    assert (inquiry.estimate_low, inquiry.estimate_high) == (850_000, 1_150_000)


def test_an_inquiry_can_be_just_a_message(client):
    assert send(client, message="یک سؤال").status_code == 201
    inquiry = Inquiry.objects.get()
    assert (inquiry.service_key, inquiry.quantity, inquiry.estimate_low) == ("", None, None)


def test_only_the_ip_digest_is_kept_never_the_address(client):
    send(client, REMOTE_ADDR="203.0.113.7") if False else client.post(
        PUBLIC, {"name": "ع", "phone": "09120000000"}, format="multipart", REMOTE_ADDR="203.0.113.7"
    )
    inquiry = Inquiry.objects.get()
    assert len(inquiry.ip_hash) == 64 and "203.0.113.7" not in inquiry.ip_hash
    fields = " ".join(str(v) for v in Inquiry.objects.values().get().values())
    assert "203.0.113.7" not in fields


def test_a_way_to_reach_the_visitor_is_required(client):
    response = client.post(PUBLIC, {"name": "ع"}, format="multipart")
    assert response.status_code == 400 and "phone" in response.json()["fields"]
    assert send(client, phone="", email="a@example.com").status_code == 201
    assert send(client, phone="", telegram="@someone").status_code == 201


def test_phone_numbers_are_normalised_and_checked(client):
    send(client, phone="۰۹۱۲ ۳۴۵ ۶۷۸۹")
    assert Inquiry.objects.get().phone == "0912 345 6789"
    assert send(client, phone="call me maybe").status_code == 400


def test_a_service_needs_a_quantity_and_must_exist(client):
    seed_rules()
    assert send(client, service="food").status_code == 400
    unknown = send(client, service="nope", quantity=1)
    assert unknown.status_code == 400 and unknown.json()["code"] == "unknown_option"
    assert send(client, service="food", quantity=1, addons=["urgent"]).status_code == 400  # a multiplier is no add-on
    assert Inquiry.objects.count() == 0


def test_limits_on_text_length(client):
    assert send(client, message="x" * 4001).status_code == 400
    assert send(client, name="x" * 121).status_code == 400
    assert send(client, name="").status_code == 400


def test_the_honeypot_looks_successful_but_stores_nothing(client):
    response = send(client, website="http://spam.example")
    assert response.status_code == 201 and response.json() == {"received": True}
    assert Inquiry.objects.count() == 0


def test_sending_is_rate_limited(client):
    from rest_framework.throttling import ScopedRateThrottle

    original = ScopedRateThrottle.THROTTLE_RATES
    ScopedRateThrottle.THROTTLE_RATES = {**original, "inquiry": "3/min"}
    try:
        codes = [send(client).status_code for _ in range(5)]
    finally:
        ScopedRateThrottle.THROTTLE_RATES = original
    assert codes == [201, 201, 201, 429, 429]


def test_a_request_far_beyond_the_file_limits_is_refused_before_parsing(client):
    response = client.post(
        PUBLIC, {"name": "ع"}, format="multipart", CONTENT_LENGTH=str(attachments.MAX_REQUEST_BYTES + 1)
    )
    assert response.status_code == 413 and response.json()["code"] == "too_large"


# ---- attachments -----------------------------------------------------------------------------------


def stored_keys(s3, settings):
    listing = s3.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET, Prefix="inquiries/")
    return [o["Key"] for o in listing.get("Contents", [])]


def test_images_and_pdfs_are_stored_privately_under_random_keys(client, s3_buckets, settings):
    files = [file("../../etc/ثبت.jpg", image_bytes("JPEG")), file("brief.pdf", PDF), file("x.png", image_bytes("PNG"))]
    response = client.post(PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": files}, format="multipart")
    assert response.status_code == 201

    stored = list(InquiryAttachment.objects.order_by("id"))
    assert [(a.original_name, a.mime) for a in stored] == [
        ("ثبت.jpg", "image/jpeg"),  # no directories in the name shown to the owner
        ("brief.pdf", "application/pdf"),
        ("x.png", "image/png"),
    ]
    keys = stored_keys(s3_buckets, settings)
    assert sorted(keys) == sorted(a.key for a in stored)
    assert all(k.startswith("inquiries/") and "brief" not in k and "ثبت" not in k for k in keys)


@pytest.mark.parametrize(
    ("name", "content"),
    [
        ("notes.jpg", b"just text pretending to be a photo"),  # the name is not trusted
        ("run.png", b"MZ\x90\x00\x03\x00\x00\x00 executable"),
        ("logo.svg", b"<svg xmlns='http://www.w3.org/2000/svg'><script>alert(1)</script></svg>"),
        ("page.html", b"<html><script>alert(1)</script></html>"),
        ("clip.mp4", b"\x00\x00\x00\x18ftypmp42\x00\x00\x00\x00mp42isom"),  # video is not accepted here
        ("empty.pdf", b""),
        ("broken.jpg", b"\xff\xd8\xff\xe0" + b"\x00" * 10),  # looks like a JPEG but is not a readable image
    ],
)
def test_other_kinds_of_files_are_refused_and_nothing_is_stored(client, s3_buckets, settings, name, content):
    response = client.post(
        PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": [file(name, content)]}, format="multipart"
    )
    assert response.status_code == 400 and "attachments" in response.json()["fields"]
    assert Inquiry.objects.count() == 0 and stored_keys(s3_buckets, settings) == []


def test_too_many_or_too_large_files_are_refused(client, s3_buckets, settings):
    four = [file(f"{i}.pdf", PDF) for i in range(4)]
    assert (
        client.post(PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": four}, format="multipart").status_code
        == 400
    )
    big = file("big.pdf", b"%PDF-" + b"0" * attachments.MAX_BYTES)
    assert (
        client.post(PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": [big]}, format="multipart").status_code
        == 400
    )
    assert Inquiry.objects.count() == 0 and stored_keys(s3_buckets, settings) == []


def test_files_are_not_left_behind_when_saving_fails(client, s3_buckets, settings, monkeypatch):
    def boom(*args, **kwargs):
        raise RuntimeError("database went away")

    monkeypatch.setattr("apps.inquiries.service.InquiryAttachment.objects.create", boom)
    with pytest.raises(RuntimeError):
        client.post(
            PUBLIC,
            {"name": "ع", "phone": "09120000000", "attachments": [file("a.pdf", PDF)]},
            format="multipart",
        )
    assert Inquiry.objects.count() == 0 and stored_keys(s3_buckets, settings) == []


# ---- owner: who may see what -----------------------------------------------------------------------


def test_the_owner_api_requires_a_verified_login(client):
    inquiry = make()
    calls = [
        client.get(ADMIN),
        client.get(f"{ADMIN}{inquiry.pk}/"),
        client.patch(f"{ADMIN}{inquiry.pk}/", {"status": "closed"}, format="json"),
        client.delete(f"{ADMIN}{inquiry.pk}/"),
        client.get(f"{ADMIN}summary/"),
        client.get(f"{ADMIN}export/"),
        client.get(f"{ADMIN}{inquiry.pk}/attachments/1/"),
    ]
    assert [c.status_code for c in calls] == [403] * 7


def test_listing_filters_and_search(owner_client):
    make(name="سارا", brand="کافه ماه", service_key="food", status="reviewing")
    make(name="رضا", phone="09351112233", service_key="product")
    make(name="مریم", email="m@example.com", message="منوی جدید می‌خواهیم")

    def names(**params):
        body = owner_client.get(ADMIN, params).json()
        return {r["name"] for r in body["results"]}

    assert names() == {"سارا", "رضا", "مریم"}
    assert names(status="reviewing") == {"سارا"}
    assert names(service="product") == {"رضا"}
    assert names(q="ماه") == {"سارا"}  # brand
    assert names(q="0935") == {"رضا"}  # contact
    assert names(q="منوی") == {"مریم"}  # message
    today = timezone.localdate().isoformat()
    assert names(**{"from": today, "to": today}) == {"سارا", "رضا", "مریم"}
    assert names(**{"from": "2999-01-01"}) == set()
    assert owner_client.get(ADMIN, {"from": "not-a-date"}).status_code == 400


def test_the_list_is_paginated_newest_first_and_marks_unseen_ones(owner_client):
    for n in range(23):
        make(name=f"n{n}")
    page = owner_client.get(ADMIN).json()
    assert (page["count"], len(page["results"])) == (23, 20)
    assert page["results"][0]["name"] == "n22" and page["results"][0]["is_new"] is True
    assert len(owner_client.get(ADMIN, {"page": 2}).json()["results"]) == 3


def test_the_badge_counts_inquiries_the_owner_has_not_opened(owner_client):
    first, second = make(name="الف"), make(name="ب")
    assert owner_client.get(f"{ADMIN}summary/").json() == {"new": 2}
    assert [r["is_new"] for r in owner_client.get(ADMIN).json()["results"]] == [
        True,
        True,
    ]  # same definition as the list

    body = owner_client.get(f"{ADMIN}{first.pk}/").json()
    assert body["seen_at"] is not None
    opened_at = Inquiry.objects.get(pk=first.pk).seen_at
    owner_client.get(f"{ADMIN}{first.pk}/")
    assert Inquiry.objects.get(pk=first.pk).seen_at == opened_at  # only the first opening counts
    assert owner_client.get(f"{ADMIN}summary/").json() == {"new": 1}
    flags = {r["name"]: r["is_new"] for r in owner_client.get(ADMIN).json()["results"]}
    assert flags == {"الف": False, "ب": True}
    assert Inquiry.objects.get(pk=first.pk).status == "new"  # reading it does not triage it

    owner_client.patch(f"{ADMIN}{second.pk}/", {"internal_note": "x"}, format="json")  # working on it counts as reading
    assert owner_client.get(f"{ADMIN}summary/").json() == {"new": 0}


def test_status_and_note_can_change_with_a_history_and_nothing_else(owner_client):
    inquiry = make(name="اصلی")
    response = owner_client.patch(
        f"{ADMIN}{inquiry.pk}/",
        {"status": "reviewing", "internal_note": "راز داخلی", "name": "هک", "estimate_low": 1},
        format="json",
    )
    assert response.status_code == 200
    inquiry.refresh_from_db()
    assert (inquiry.status, inquiry.internal_note, inquiry.name, inquiry.estimate_low) == (
        "reviewing",
        "راز داخلی",
        "اصلی",
        None,
    )

    owner_client.patch(f"{ADMIN}{inquiry.pk}/", {"status": "closed"}, format="json")
    history = owner_client.get(f"{ADMIN}{inquiry.pk}/").json()["history"]
    assert [(h["from_status"], h["to_status"]) for h in history] == [("new", "reviewing"), ("reviewing", "closed")]

    logged = AuditLog.objects.filter(action="inquiries.inquiry.update")
    assert logged.count() == 2 and all("راز داخلی" not in str(a.metadata) for a in logged)
    assert owner_client.patch(f"{ADMIN}{inquiry.pk}/", {"status": "bogus"}, format="json").status_code == 400


def test_saving_only_a_note_adds_no_history(owner_client):
    inquiry = make()
    owner_client.patch(f"{ADMIN}{inquiry.pk}/", {"internal_note": "فقط یادداشت"}, format="json")
    assert owner_client.get(f"{ADMIN}{inquiry.pk}/").json()["history"] == []


def test_deleting_an_inquiry_removes_its_files(
    owner_client, client, s3_buckets, settings, django_capture_on_commit_callbacks
):
    with django_capture_on_commit_callbacks(execute=True):
        client.post(
            PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": [file("a.pdf", PDF)]}, format="multipart"
        )
    assert len(stored_keys(s3_buckets, settings)) == 1
    inquiry = Inquiry.objects.get()
    with django_capture_on_commit_callbacks(execute=True):
        assert owner_client.delete(f"{ADMIN}{inquiry.pk}/").status_code == 204
    assert stored_keys(s3_buckets, settings) == [] and InquiryAttachment.objects.count() == 0


def test_an_attachment_downloads_through_a_short_signed_path_as_a_file(owner_client, client, s3_buckets, settings):
    client.post(
        PUBLIC, {"name": "ع", "phone": "09120000000", "attachments": [file("نیاز.pdf", PDF)]}, format="multipart"
    )
    inquiry, stored = Inquiry.objects.get(), InquiryAttachment.objects.get()
    response = owner_client.get(f"{ADMIN}{inquiry.pk}/attachments/{stored.pk}/")

    assert response.status_code == 302
    assert (response["Cache-Control"], response["Referrer-Policy"]) == ("no-store", "no-referrer")
    target = urlsplit(response["Location"])
    assert not target.netloc and target.path == f"/storage-signed/{settings.S3_PRIVATE_BUCKET}/{stored.key}"
    query = parse_qs(target.query)
    assert int(query["X-Amz-Expires"][0]) <= 60
    assert "attachment" in query["response-content-disposition"][0]
    assert AuditLog.objects.filter(action="inquiries.attachment.download").exists()

    other = make()
    assert owner_client.get(f"{ADMIN}{other.pk}/attachments/{stored.pk}/").status_code == 404  # not that inquiry's


# ---- CSV -------------------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("value", "expected"),
    [("=1+1", "'=1+1"), ("+98912", "'+98912"), ("-5", "'-5"), ("@SUM(A1)", "'@SUM(A1)"), ("\tx", "'\tx"),
     ("سلام", "سلام"), ("a=b", "a=b"), ("", ""), (42, 42), (None, None)],
)  # fmt: skip
def test_safe_cell(value, expected):
    assert safe_cell(value) == expected


def test_the_csv_export_neutralises_formulas_and_follows_the_filters(owner_client):
    make(
        name='=HYPERLINK("http://evil","x")',
        message="@SUM(1)",
        service_label="غذا",
        estimate_low=100,
        estimate_high=200,
    )
    make(name="دیگری", status="closed")
    response = owner_client.get(f"{ADMIN}export/", {"status": "new"})

    assert response.status_code == 200
    assert response["Content-Type"].startswith("text/csv") and "attachment" in response["Content-Disposition"]
    text = response.content.decode()
    assert text.startswith("﻿")  # Excel opens it as UTF-8
    rows = list(csv.reader(io.StringIO(text.lstrip("﻿"))))
    assert rows[0][:3] == ["id", "created_at", "name"] and len(rows) == 2  # header + the one «new» inquiry
    row = dict(zip(rows[0], rows[1], strict=True))
    assert row["name"].startswith("'=") and row["message"] == "'@SUM(1)"
    assert (row["service"], row["estimate_low"], row["estimate_high"]) == ("غذا", "100", "200")
    assert AuditLog.objects.filter(action="inquiries.export").exists()


# ---- sample data -----------------------------------------------------------------------------------


def test_the_sample_rules_command_is_repeatable_and_gives_a_working_calculator(client):
    call_command("seed_quote_demo")
    call_command("seed_quote_demo")
    assert QuoteRule.objects.count() == 5
    body = client.post(
        "/api/public/quote/estimate",
        {"service": "sample-food", "quantity": 2, "addons": ["sample-video"]},
        format="json",
    ).json()
    assert body["low"] < body["high"] and body["approximate"] is True


# ---- language ---------------------------------------------------------------------------------------


def errors_for(client, language, **fields):
    response = client.post(PUBLIC, {"name": "ع", "language": language} | fields, format="multipart")
    assert response.status_code == 400
    return response.json()


def test_an_english_visitor_gets_english_messages_and_a_persian_visitor_persian_ones(client):
    en = errors_for(client, "en")  # no way to reach them
    assert en["fields"]["phone"][0].startswith("Enter at least one way")
    fa = errors_for(client, "fa")
    assert fa["fields"]["phone"][0].startswith("دست‌کم یکی")

    assert errors_for(client, "en", phone="call me")["fields"]["phone"] == ["The phone number is not valid."]
    assert errors_for(client, "fa", phone="call me")["fields"]["phone"] == ["شماره‌ی تلفن معتبر نیست."]
    assert errors_for(client, "en", phone="09120000000", service="x")["fields"]["quantity"] == [
        "Enter the number of products."
    ]


def test_built_in_field_errors_follow_the_visitors_language_too(client):
    en = client.post(PUBLIC, {"language": "en", "phone": "09120000000"}, format="multipart").json()
    assert en["fields"]["name"] == ["This field is required."]
    fa = client.post(PUBLIC, {"language": "fa", "phone": "09120000000"}, format="multipart").json()
    assert fa["fields"]["name"] != ["This field is required."]
    assert errors_for(client, "en", phone="09120000000", email="nope")["fields"]["email"] == [
        "Enter a valid email address."
    ]


def test_file_and_calculator_messages_are_in_the_visitors_language(client, s3_buckets):
    seed_rules()
    bad = file("notes.jpg", b"not an image")
    en = errors_for(client, "en", phone="09120000000", attachments=[bad])
    assert en["fields"]["attachments"] == ["Only images (JPEG, PNG, WebP) and PDF files are accepted."]
    fa = errors_for(client, "fa", phone="09120000000", attachments=[file("notes.jpg", b"not an image")])
    assert fa["fields"]["attachments"][0].startswith("فقط تصویر")

    four = [file(f"{i}.pdf", PDF) for i in range(4)]
    assert errors_for(client, "en", phone="09120000000", attachments=four)["fields"]["attachments"] == [
        "You can attach at most 3 files."
    ]

    out_of_range = errors_for(client, "en", phone="09120000000", service="food", quantity=9999)
    assert out_of_range["code"] == "bad_quantity" and out_of_range["detail"].startswith("The number must be between")
    assert errors_for(client, "fa", phone="09120000000", service="food", quantity=9999)["detail"].startswith(
        "تعداد باید"
    )
    unknown = errors_for(client, "en", phone="09120000000", service="nope", quantity=1)
    assert unknown["detail"] == "The selected option is not valid."


def test_an_unknown_language_is_treated_as_persian(client):
    assert errors_for(client, "de")["fields"]["language"]  # not a valid choice, whatever language it is reported in


def test_stored_labels_are_the_ones_the_visitor_saw(client):
    seed_rules()  # food has an English label; video and urgent have none
    send(client, language="en", service="food", quantity=1, addons=["video"], multipliers=["urgent"])
    send(client, language="fa", service="food", quantity=1, addons=["video"])
    english, persian = Inquiry.objects.order_by("id")
    assert english.service_label == "Food"
    assert english.options["addons"] == [{"key": "video", "label": "ویدیو"}]  # no English text: the form showed Persian
    assert persian.service_label == "غذا"
