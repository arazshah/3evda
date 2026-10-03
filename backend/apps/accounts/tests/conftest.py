import pytest
from django.contrib.auth import get_user_model
from django_otp.oath import totp
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

PASSWORD = "a-long-password-123"


def code_for(device: TOTPDevice, offset: int = 0) -> str:
    return f"{totp(device.bin_key, step=device.step, t0=device.t0, digits=device.digits, drift=offset):06d}"


@pytest.fixture
def owner(db):
    return get_user_model().objects.create_superuser("owner", password=PASSWORD)


@pytest.fixture
def enrolled_owner(owner):
    TOTPDevice.objects.create(user=owner, name="authenticator", confirmed=True)
    return owner


class BrowserLikeClient(APIClient):
    """Sends the current CSRF cookie as X-CSRFToken on every request, like the panel does.

    Django rotates the token on login, so a header captured once would go stale.
    """

    def generic(self, method, path, *args, **kwargs):  # type: ignore[no-untyped-def]
        if "csrftoken" in self.cookies:
            kwargs.setdefault("HTTP_X_CSRFTOKEN", self.cookies["csrftoken"].value)
        return super().generic(method, path, *args, **kwargs)


@pytest.fixture
def api():
    return BrowserLikeClient(enforce_csrf_checks=True)


def csrf(api: APIClient) -> None:
    api.get("/api/auth/csrf")


@pytest.fixture
def logged_in(api, enrolled_owner):
    """Password accepted, TOTP not yet verified."""
    csrf(api)
    assert api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json").status_code == 200
    return api


@pytest.fixture
def verified(logged_in, enrolled_owner):
    device = TOTPDevice.objects.get(user=enrolled_owner)
    response = logged_in.post("/api/auth/verify", {"code": code_for(device)}, format="json")
    assert response.status_code == 200, response.content
    return logged_in
