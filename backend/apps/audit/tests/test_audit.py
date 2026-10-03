import pytest
from django.contrib.auth import get_user_model
from django.test import RequestFactory

from apps.audit.models import AuditLog
from apps.audit.service import record
from apps.core.logging import request_id_var


@pytest.mark.django_db
def test_record_captures_actor_target_ip_and_request_id(settings):
    settings.TRUSTED_PROXY_COUNT = 1
    user = get_user_model().objects.create_superuser("owner", password="a-long-password-123")
    request = RequestFactory().get("/", HTTP_X_FORWARDED_FOR="203.0.113.9")
    request.user = user
    token = request_id_var.set("req-1")
    try:
        record("media.upload", request=request, target=user, filename="a.jpg")
    finally:
        request_id_var.reset(token)

    entry = AuditLog.objects.get()
    assert entry.action == "media.upload"
    assert entry.actor == user
    assert entry.ip == "203.0.113.9"
    assert entry.request_id == "req-1"
    assert entry.target_type == "accounts.user"
    assert entry.target_id == str(user.pk)
    assert entry.metadata == {"filename": "a.jpg"}


@pytest.mark.django_db
def test_record_without_request_or_actor():
    record("admin.bootstrap", username="x")
    entry = AuditLog.objects.get()
    assert entry.actor is None
    assert entry.ip is None
    assert entry.metadata == {"username": "x"}


@pytest.mark.django_db
def test_audit_entries_are_read_only_in_django_admin(admin_client):
    from django.contrib import admin

    from apps.audit.admin import AuditLogAdmin

    model_admin = AuditLogAdmin(AuditLog, admin.site)
    assert not model_admin.has_add_permission(None)
    assert not model_admin.has_change_permission(None)
    assert not model_admin.has_delete_permission(None)
