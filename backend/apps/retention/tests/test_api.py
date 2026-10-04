import pytest

from apps.audit.models import AuditLog
from apps.inquiries.models import Inquiry
from apps.retention.models import RetentionSettings

pytestmark = pytest.mark.django_db

SETTINGS = "/api/admin/retention/settings/"
PREVIEW = "/api/admin/retention/preview/"
RUN = "/api/admin/retention/run/"


@pytest.mark.parametrize(("method", "url"), [("get", SETTINGS), ("patch", SETTINGS), ("get", PREVIEW), ("post", RUN)])
def test_only_the_signed_in_owner(client, method, url):
    assert getattr(client, method)(url, {}, format="json").status_code in (401, 403)


def test_defaults_are_the_plan(owner_client):
    body = owner_client.get(SETTINGS).json()
    assert (body["enabled"], body["inquiry_months"], body["booking_months"]) == (True, 24, 24)
    assert (body["gallery_days"], body["proforma_months"]) == (90, 60)
    assert body["last_run_at"] is None


def test_the_owner_changes_the_periods_and_it_is_audited(owner_client):
    r = owner_client.patch(SETTINGS, {"inquiry_months": 12, "gallery_days": 30}, format="json")
    assert r.status_code == 200
    s = RetentionSettings.load()
    assert (s.inquiry_months, s.gallery_days) == (12, 30)
    assert AuditLog.objects.filter(action="retention.settings.update").exists()


@pytest.mark.parametrize(
    "bad",
    [
        {"inquiry_months": 1},
        {"booking_months": 500},
        {"gallery_days": 3},
        {"proforma_months": 6},
        {"gallery_days": "x"},
    ],
)
def test_silly_periods_are_refused(owner_client, bad):
    assert owner_client.patch(SETTINGS, bad, format="json").status_code == 400
    assert RetentionSettings.load().gallery_days == 90


def test_the_last_run_fields_cannot_be_written(owner_client):
    owner_client.patch(
        SETTINGS, {"last_run": {"counts": {"x": 1}}, "last_run_at": "2020-01-01T00:00:00Z"}, format="json"
    )
    s = RetentionSettings.load()
    assert s.last_run == {} and s.last_run_at is None


def test_the_preview_is_read_only_and_has_no_personal_detail(owner_client):
    from datetime import timedelta

    from django.utils import timezone

    inquiry = Inquiry.objects.create(name="سارا رحیمی", phone="09123456789", email="sara@example.com")
    Inquiry.objects.filter(pk=inquiry.pk).update(created_at=timezone.now() - timedelta(days=900))
    r = owner_client.get(PREVIEW)
    assert r.status_code == 200
    body = r.json()
    assert body["enabled"] is True
    assert {row["key"]: row["count"] for row in body["rows"]}["inquiries"] == 1
    text = r.content.decode()
    assert "سارا" not in text and "09123456789" not in text and "sara@example.com" not in text
    assert Inquiry.objects.get(pk=inquiry.pk).name == "سارا رحیمی"  # nothing changed
    assert r["Cache-Control"] == "private, no-store"


def test_running_needs_an_explicit_confirmation(owner_client):
    for body in ({}, {"confirm": False}):
        assert owner_client.post(RUN, body, format="json").status_code == 400
    assert not AuditLog.objects.filter(action="retention.run").exists()


def test_a_confirmed_run_applies_the_rules_and_is_audited_with_the_owner(owner_client, owner_user):
    from datetime import timedelta

    from django.utils import timezone

    inquiry = Inquiry.objects.create(name="سارا رحیمی", phone="09123456789")
    Inquiry.objects.filter(pk=inquiry.pk).update(created_at=timezone.now() - timedelta(days=900))
    r = owner_client.post(RUN, {"confirm": True}, format="json")
    assert r.status_code == 200 and r.json()["counts"]["inquiries"] == 1 and r.json()["trigger"] == "manual"
    assert Inquiry.objects.get(pk=inquiry.pk).phone == ""
    entry = AuditLog.objects.get(action="retention.run")
    assert entry.actor == owner_user and entry.metadata["trigger"] == "manual"


def test_the_settings_show_the_last_run_afterwards(owner_client):
    owner_client.post(RUN, {"confirm": True}, format="json")
    body = owner_client.get(SETTINGS).json()
    assert body["last_run_at"] is not None and body["last_run"]["trigger"] == "manual"
