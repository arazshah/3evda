import pytest
from django.contrib.auth import get_user_model
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient


def verify_client(client: APIClient, user) -> APIClient:  # type: ignore[no-untyped-def]
    """Log `client` in as `user` with a verified second factor (skips the HTTP sign-in flow)."""
    device, _ = TOTPDevice.objects.get_or_create(user=user, name="authenticator", defaults={"confirmed": True})
    client.force_login(user)
    session = client.session
    session[DEVICE_ID_SESSION_KEY] = device.persistent_id
    session.save()
    return client


@pytest.fixture
def owner_user(db):
    return get_user_model().objects.create_superuser("owner", password="a-long-password-123")


@pytest.fixture
def owner_client(owner_user) -> APIClient:
    """API client for the owner, password and TOTP verified."""
    return verify_client(APIClient(), owner_user)
