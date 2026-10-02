from io import StringIO

import pytest
from django.contrib.auth import get_user_model
from django.core.management import CommandError, call_command
from django_otp.plugins.otp_static.models import StaticDevice
from django_otp.plugins.otp_totp.models import TOTPDevice

from apps.audit.models import AuditLog

User = get_user_model()


@pytest.mark.django_db
def test_bootstrap_creates_the_owner_from_the_environment(monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "a-very-long-password-42")
    out = StringIO()
    call_command("bootstrap_admin", "--username", "sevda", stdout=out)

    user = User.objects.get()
    assert user.username == "sevda"
    assert user.is_staff and user.is_superuser
    assert user.check_password("a-very-long-password-42")
    assert "TOTP" in out.getvalue()
    assert AuditLog.objects.filter(action="admin.bootstrap").exists()


@pytest.mark.django_db
def test_bootstrap_refuses_when_an_admin_exists(monkeypatch):
    User.objects.create_superuser("owner", password="a-long-password-123")
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "a-very-long-password-42")
    with pytest.raises(CommandError, match="already exists"):
        call_command("bootstrap_admin", "--username", "other")
    assert User.objects.count() == 1


@pytest.mark.django_db
def test_bootstrap_rejects_a_weak_password(monkeypatch):
    monkeypatch.setenv("ADMIN_BOOTSTRAP_PASSWORD", "short")
    with pytest.raises(CommandError):
        call_command("bootstrap_admin", "--username", "sevda")
    assert not User.objects.exists()


@pytest.mark.django_db
def test_bootstrap_requires_a_password_when_not_interactive(monkeypatch):
    monkeypatch.delenv("ADMIN_BOOTSTRAP_PASSWORD", raising=False)
    with pytest.raises(CommandError, match="ADMIN_BOOTSTRAP_PASSWORD"):
        call_command("bootstrap_admin", "--username", "sevda", "--no-input")


@pytest.mark.django_db
def test_reset_admin_mfa_removes_devices_and_sessions(client):
    user = User.objects.create_superuser("owner", password="a-long-password-123")
    TOTPDevice.objects.create(user=user, name="app", confirmed=True)
    StaticDevice.objects.create(user=user, name="recovery")
    client.force_login(user)

    call_command("reset_admin_mfa", stdout=StringIO())

    assert not TOTPDevice.objects.exists()
    assert not StaticDevice.objects.exists()
    from django.contrib.sessions.models import Session

    assert not Session.objects.exists()
    assert AuditLog.objects.filter(action="admin.mfa_reset").exists()
