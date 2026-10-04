from datetime import timedelta

import pytest
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.booking.models import Booking, SessionType
from apps.galleries.models import Gallery, GalleryPhoto
from apps.inquiries.models import Inquiry, InquiryAttachment, InquiryStatusChange
from apps.proformas.models import Proforma, ProformaItem
from apps.retention import service
from apps.retention.models import RetentionSettings
from apps.retention.service import ANONYMOUS, months_ago

pytestmark = pytest.mark.django_db

NOW = timezone.now()


@pytest.fixture(autouse=True)
def _commit_hooks_run(monkeypatch):
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())


def aged(model, pk, **fields):
    """created_at is automatic; the tests move rows into the past."""
    model.objects.filter(pk=pk).update(**fields)


def ago(months=0, days=0):
    return months_ago(NOW, months) - timedelta(days=days)


def make_inquiry(age_months, **extra):
    inquiry = Inquiry.objects.create(
        name="سارا رحیمی",
        brand="کافه",
        phone="09123456789",
        whatsapp="wa-id",
        telegram="@sara",
        email="sara@example.com",
        message="متن خصوصی",
        internal_note="یادداشت خصوصی",
        ip_hash="a" * 64,
        service_key="food",
        service_label="غذا",
        estimate_low=100,
        estimate_high=200,
        status="converted",
        **extra,
    )
    aged(Inquiry, inquiry.pk, created_at=ago(age_months, days=2))
    return Inquiry.objects.get(pk=inquiry.pk)


def make_booking(months_after_session):
    studio, _ = SessionType.objects.get_or_create(key="s", defaults={"title_fa": "س", "duration_minutes": 60})
    end = ago(months_after_session, days=2)
    return Booking.objects.create(
        session_type=studio,
        session_label="استودیو",
        start_at=end - timedelta(hours=1),
        end_at=end,
        blocked_until=end,
        name="سارا",
        brand="کافه",
        phone="09123456789",
        whatsapp="w",
        telegram="t",
        email="s@example.com",
        notes="توضیح",
        internal_note="خصوصی",
        cancel_reason="دلیل",
        ip_hash="b" * 64,
        status="confirmed",
    )


def make_gallery(**extra):
    return Gallery.objects.create(**{"title": "گالری", "client_name": "سارا", "status": "published"} | extra)


FINANCIAL = [
    "number",
    "status",
    "language",
    "subtotal",
    "discount",
    "discount_amount",
    "tax",
    "total",
    "terms",
    "valid_until",
    "issue_date",
    "issued_at",
    "issuer",
    "link_version",
    "public_id",
]


def make_proforma(age_months):
    issued = ago(age_months, days=2)
    proforma = Proforma.objects.create(
        number=f"P-{age_months}",
        status="approved",
        customer_name="سارا رحیمی",
        customer_company="کافه",
        customer_contact="0912",
        subtotal=4_000_000,
        discount=100_000,
        tax=351_000,
        total=4_251_000,
        terms="شرایط",
        issue_date=issued.date(),
        valid_until=(issued + timedelta(days=7)).date(),
        issued_at=issued,
        issuer={"name": "سودا"},
        response_ip_hash="c" * 64,
        response_user_agent="Firefox",
        rejection_reason="دلیل شخصی",
    )
    ProformaItem.objects.create(proforma=proforma, description="عکاسی", quantity=2, unit_price=2_000_000, position=0)
    return Proforma.objects.get(pk=proforma.pk)


def snapshot(proforma):
    row = Proforma.objects.get(pk=proforma.pk)
    return {f: getattr(row, f) for f in FINANCIAL} | {
        "items": list(row.items.values_list("description", "quantity", "unit_price", "position"))
    }


# ---- the date arithmetic ------------------------------------------------------------------------------


@pytest.mark.parametrize(
    ("now", "months", "expected"),
    [
        ("2026-10-04", 24, "2024-10-04"),
        ("2026-03-31", 1, "2026-02-28"),
        ("2024-03-31", 1, "2024-02-29"),
        ("2026-01-15", 2, "2025-11-15"),
        ("2026-10-04", 60, "2021-10-04"),
    ],
)
def test_months_ago(now, months, expected):
    from datetime import datetime

    assert months_ago(datetime.fromisoformat(now), months).date().isoformat() == expected


# ---- enquiries ----------------------------------------------------------------------------------------


def test_an_old_enquiry_is_anonymised_but_keeps_what_statistics_need(s3_buckets):
    inquiry = make_inquiry(30)
    service.run(now=NOW)
    row = Inquiry.objects.get(pk=inquiry.pk)
    assert row.name == ANONYMOUS
    for field in ("brand", "phone", "whatsapp", "telegram", "email", "message", "internal_note", "ip_hash"):
        assert getattr(row, field) == "", field
    assert row.anonymized_at is not None
    assert (row.status, row.service_key, row.service_label) == ("converted", "food", "غذا")
    assert (row.estimate_low, row.estimate_high) == (100, 200)
    assert row.created_at == inquiry.created_at


def test_a_recent_enquiry_is_untouched():
    inquiry = make_inquiry(23)
    service.run(now=NOW)
    row = Inquiry.objects.get(pk=inquiry.pk)
    assert row.name == "سارا رحیمی" and row.phone == "09123456789" and row.anonymized_at is None


def test_the_enquiry_limit_is_the_one_in_the_settings():
    inquiry = make_inquiry(13)
    RetentionSettings.objects.update_or_create(pk=1, defaults={"inquiry_months": 12})
    service.run(now=NOW)
    assert Inquiry.objects.get(pk=inquiry.pk).name == ANONYMOUS


def test_attachments_of_an_anonymised_enquiry_are_removed_with_their_files(s3_buckets, settings):
    inquiry = make_inquiry(30)
    for key in ("inquiries/a.pdf", "inquiries/b.png"):
        s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key, Body=b"data")
        InquiryAttachment.objects.create(inquiry=inquiry, key=key, original_name="x", mime="application/pdf", size=4)
    service.run(now=NOW)
    assert not InquiryAttachment.objects.exists()
    assert s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("KeyCount", 0) == 0


def test_the_history_of_status_changes_stays():
    inquiry = make_inquiry(30)
    InquiryStatusChange.objects.create(inquiry=inquiry, from_status="new", to_status="converted")
    service.run(now=NOW)
    assert inquiry.history.count() == 1


# ---- bookings -----------------------------------------------------------------------------------------


def test_an_old_booking_is_anonymised_and_keeps_its_dates_and_labels():
    booking = make_booking(30)
    start = booking.start_at
    service.run(now=NOW)
    row = Booking.objects.get(pk=booking.pk)
    assert row.name == ANONYMOUS
    for field in (
        "brand",
        "phone",
        "whatsapp",
        "telegram",
        "email",
        "notes",
        "internal_note",
        "cancel_reason",
        "ip_hash",
    ):
        assert getattr(row, field) == "", field
    assert (row.start_at, row.status, row.session_label) == (start, "confirmed", "استودیو")


def test_a_recent_or_upcoming_booking_is_untouched():
    recent = make_booking(10)
    upcoming = make_booking(-1)  # a month ahead
    service.run(now=NOW)
    for booking in (recent, upcoming):
        assert Booking.objects.get(pk=booking.pk).phone == "09123456789"


# ---- galleries ----------------------------------------------------------------------------------------


def test_a_gallery_that_expired_long_ago_goes_with_all_its_files(s3_buckets, settings):
    gallery = make_gallery(expires_at=NOW - timedelta(days=100))
    keys = []
    for i in range(2):
        original, thumb, preview = f"g/{i}/o.jpg", f"g/{i}/t.webp", f"g/{i}/p.webp"
        keys += [original, thumb, preview]
        GalleryPhoto.objects.create(
            gallery=gallery,
            original_key=original,
            thumb_key=thumb,
            preview_key=preview,
            original_filename="a",
            mime="image/jpeg",
            size_bytes=3,
            sha256=str(i) * 64,
            position=i,
            status="ready",
        )
    for key in keys:
        s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key, Body=b"x")
    service.run(now=NOW)
    assert not Gallery.objects.filter(pk=gallery.pk).exists() and not GalleryPhoto.objects.exists()
    assert s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("KeyCount", 0) == 0


def test_an_archived_gallery_goes_after_the_same_time():
    gallery = make_gallery(expires_at=None, status="archived")
    aged(Gallery, gallery.pk, updated_at=NOW - timedelta(days=100))
    service.run(now=NOW)
    assert not Gallery.objects.exists()


@pytest.mark.parametrize(
    "extra",
    [
        {"expires_at": NOW - timedelta(days=89)},  # expired, but not long enough ago
        {"expires_at": NOW + timedelta(days=5)},  # still open
        {"expires_at": None},  # never expires
    ],
)
def test_a_gallery_that_is_current_stays(extra):
    gallery = make_gallery(**extra)
    service.run(now=NOW)
    assert Gallery.objects.filter(pk=gallery.pk).exists()


def test_a_recently_archived_gallery_stays():
    gallery = make_gallery(expires_at=None, status="archived")
    service.run(now=NOW)
    assert Gallery.objects.filter(pk=gallery.pk).exists()


# ---- proformas: the safety rules ----------------------------------------------------------------------


def test_an_issued_proforma_keeps_every_financial_field_byte_for_byte_while_the_customer_is_anonymised():
    old = make_proforma(70)
    before = snapshot(old)
    service.run(now=NOW)
    row = Proforma.objects.get(pk=old.pk)
    assert snapshot(old) == before  # numbers, items, amounts, dates, status, terms, issuer, link
    assert row.customer_name == ANONYMOUS
    for field in (
        "customer_company",
        "customer_contact",
        "response_ip_hash",
        "response_user_agent",
        "rejection_reason",
    ):
        assert getattr(row, field) == "", field
    assert row.anonymized_at is not None


def test_an_issued_proforma_is_never_deleted_however_old():
    ancient = make_proforma(200)
    service.run(now=NOW)
    assert Proforma.objects.filter(pk=ancient.pk).exists() and ancient.items.count() == 1


def test_a_proforma_inside_its_own_longer_limit_keeps_the_customer_details():
    young = make_proforma(40)  # past the 24 months of an enquiry, inside the 60 of a proforma
    service.run(now=NOW)
    assert Proforma.objects.get(pk=young.pk).customer_name == "سارا رحیمی"


def test_the_linked_enquiry_follows_its_own_rule_and_the_link_stays():
    inquiry = make_inquiry(30)
    proforma = make_proforma(40)
    Proforma.objects.filter(pk=proforma.pk).update(inquiry=inquiry)
    service.run(now=NOW)
    assert Inquiry.objects.get(pk=inquiry.pk).name == ANONYMOUS
    row = Proforma.objects.get(pk=proforma.pk)
    assert row.inquiry_id == inquiry.pk and row.customer_name == "سارا رحیمی"


def test_the_pdf_of_an_anonymised_proforma_is_drawn_from_the_anonymised_row(monkeypatch):
    from apps.proformas import pdf

    seen = {}

    def capture(string, **kwargs):
        seen["html"] = string

        class Fake:
            def write_pdf(self):
                return b"%PDF-"

        return Fake()

    monkeypatch.setattr(pdf, "HTML", capture)
    old = make_proforma(70)
    service.run(now=NOW)
    assert pdf.render_pdf(Proforma.objects.get(pk=old.pk)) == b"%PDF-"
    assert "سارا رحیمی" not in seen["html"] and ANONYMOUS in seen["html"]
    assert f"P-{70}" in seen["html"]  # the number is still on the document


# ---- the run itself -----------------------------------------------------------------------------------


def test_a_second_run_changes_nothing():
    make_inquiry(30), make_booking(30), make_proforma(70)
    make_gallery(expires_at=NOW - timedelta(days=100))
    first = service.run(now=NOW)
    assert first["counts"] == {"inquiries": 1, "bookings": 1, "galleries": 1, "proformas": 1}
    snapshot_rows = list(Inquiry.objects.values()) + list(Booking.objects.values()) + list(Proforma.objects.values())
    second = service.run(now=NOW)
    assert second["counts"] == {"inquiries": 0, "bookings": 0, "galleries": 0, "proformas": 0}
    assert snapshot_rows == list(Inquiry.objects.values()) + list(Booking.objects.values()) + list(
        Proforma.objects.values()
    )


def test_switched_off_keeps_everything():
    inquiry, booking, proforma = make_inquiry(30), make_booking(30), make_proforma(70)
    gallery = make_gallery(expires_at=NOW - timedelta(days=100))
    RetentionSettings.objects.update_or_create(pk=1, defaults={"enabled": False})
    result = service.run(now=NOW)
    assert result["enabled"] is False and sum(result["counts"].values()) == 0
    assert Inquiry.objects.get(pk=inquiry.pk).phone and Booking.objects.get(pk=booking.pk).phone
    assert Proforma.objects.get(pk=proforma.pk).customer_name == "سارا رحیمی"
    assert Gallery.objects.filter(pk=gallery.pk).exists()


def test_a_failing_step_does_not_stop_the_others(monkeypatch):
    make_inquiry(30), make_booking(30)

    def boom(obj, now):
        raise RuntimeError("storage down")

    monkeypatch.setitem(service.STEPS, "inquiries", boom)
    result = service.run(now=NOW)
    assert result["counts"]["inquiries"] == 0 and result["counts"]["bookings"] == 1


def test_every_run_leaves_an_audit_record_with_counts_and_no_personal_detail():
    make_inquiry(30)
    service.run(now=NOW)
    entry = AuditLog.objects.get(action="retention.run")
    assert entry.metadata["counts"]["inquiries"] == 1 and entry.metadata["trigger"] == "scheduled"
    assert "سارا" not in str(entry.metadata) and "09123456789" not in str(entry.metadata)


def test_the_settings_remember_the_last_run():
    make_inquiry(30)
    service.run(now=NOW)
    settings = RetentionSettings.load()
    assert settings.last_run_at == NOW and settings.last_run["counts"]["inquiries"] == 1


# ---- the preview -------------------------------------------------------------------------------------


def test_the_preview_counts_what_a_run_would_do_and_changes_nothing():
    make_inquiry(30), make_inquiry(31), make_booking(30), make_proforma(70)
    make_gallery(expires_at=NOW - timedelta(days=100))
    before = list(Inquiry.objects.values()) + list(Booking.objects.values()) + list(Proforma.objects.values())
    rows = {r["key"]: r for r in service.preview(NOW)}
    assert {k: r["count"] for k, r in rows.items()} == {"inquiries": 2, "bookings": 1, "galleries": 1, "proformas": 1}
    assert rows["inquiries"]["oldest"] is not None
    assert before == list(Inquiry.objects.values()) + list(Booking.objects.values()) + list(Proforma.objects.values())
    assert Gallery.objects.count() == 1 and not AuditLog.objects.filter(action="retention.run").exists()


def test_the_preview_matches_what_a_run_then_does():
    make_inquiry(30), make_booking(30), make_proforma(70)
    make_gallery(expires_at=NOW - timedelta(days=100))
    predicted = {r["key"]: r["count"] for r in service.preview(NOW)}
    assert service.run(now=NOW)["counts"] == predicted


def test_the_preview_of_nothing_is_zeros_and_no_dates():
    rows = service.preview(NOW)
    assert all(r["count"] == 0 and r["oldest"] is None for r in rows)


# ---- the schedule ------------------------------------------------------------------------------------


def test_the_task_runs_the_rules(monkeypatch):
    from apps.retention import tasks

    make_inquiry(30)
    assert tasks.run_retention()["inquiries"] == 1


def test_it_is_scheduled_after_the_nightly_backup(settings):
    entry = settings.CELERY_BEAT_SCHEDULE["retention-run"]
    assert entry["task"] == "apps.retention.tasks.run_retention"
    assert (entry["schedule"].hour, entry["schedule"].minute) == ({4}, {15})
