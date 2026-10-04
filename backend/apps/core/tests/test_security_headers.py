import pytest
from rest_framework.test import APIClient

from apps.core.middleware import PERMISSIONS_POLICY

pytestmark = pytest.mark.django_db


@pytest.mark.parametrize(
    "path", ["/api/health/live", "/api/auth/me", "/api/admin/galleries/", "/api/public/booking/options"]
)
def test_every_api_answer_carries_the_security_headers(path):
    r = APIClient().get(path)
    assert r["X-Content-Type-Options"] == "nosniff"
    assert r["X-Frame-Options"] == "DENY"
    assert r["Referrer-Policy"] == "strict-origin-when-cross-origin"
    assert r["Cross-Origin-Opener-Policy"] == "same-origin"
    assert r["Cross-Origin-Resource-Policy"] == "same-site"
    assert r["Permissions-Policy"] == PERMISSIONS_POLICY
    for denied in ("camera=()", "microphone=()", "geolocation=()", "payment=()"):
        assert denied in r["Permissions-Policy"]


@pytest.mark.parametrize("path", ["/api/auth/me", "/api/admin/galleries/", "/api/admin/inquiries/"])
def test_answers_about_the_owner_and_the_panel_are_never_cached(path):
    assert APIClient().get(path)["Cache-Control"] == "private, no-store"


def test_a_view_that_chose_its_own_caching_keeps_it():
    r = APIClient().get("/api/public/booking/options")
    assert "no-store" not in r["Cache-Control"]  # the public options page is cached for a short time on purpose


def test_the_request_id_is_still_there():
    assert APIClient().get("/api/health/live", HTTP_X_REQUEST_ID="abc123")["X-Request-ID"] == "abc123"
