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


def test_api_answers_are_saved_not_rendered_if_a_browser_opens_them():
    r = APIClient().get("/api/health/live")
    assert r["Content-Type"].startswith("application/json")
    assert r["Content-Disposition"] == 'attachment; filename="api.json"'


def test_an_answer_that_names_its_own_download_keeps_its_name(owner_client):
    from django.http import HttpResponse
    from django.test import RequestFactory

    from apps.core.middleware import SecurityHeadersMiddleware

    def view(request):
        response = HttpResponse(b"{}", content_type="application/json")
        response["Content-Disposition"] = 'attachment; filename="mine.json"'
        return response

    response = SecurityHeadersMiddleware(view)(RequestFactory().get("/api/x"))
    assert response["Content-Disposition"] == 'attachment; filename="mine.json"'


def test_pages_and_files_that_are_not_json_are_not_given_a_download_name():
    from django.http import HttpResponse
    from django.test import RequestFactory

    from apps.core.middleware import SecurityHeadersMiddleware

    html = SecurityHeadersMiddleware(lambda r: HttpResponse("<p>", content_type="text/html"))(
        RequestFactory().get("/x")
    )
    assert "Content-Disposition" not in html
    image = SecurityHeadersMiddleware(lambda r: HttpResponse(b"x", content_type="image/webp"))(
        RequestFactory().get("/api/public/x")
    )
    assert "Content-Disposition" not in image


@pytest.mark.parametrize(
    "content_type",
    [
        "application/json",
        "application/json; charset=utf-8",
        "application/vnd.oai.openapi+json",
        "application/problem+json",
    ],
)
def test_every_json_flavour_is_saved_not_rendered(content_type):
    from django.http import HttpResponse
    from django.test import RequestFactory

    from apps.core.middleware import SecurityHeadersMiddleware

    response = SecurityHeadersMiddleware(lambda r: HttpResponse("{}", content_type=content_type))(
        RequestFactory().get("/api/x")
    )
    assert response["Content-Disposition"] == 'attachment; filename="api.json"'


def test_the_openapi_schema_the_owner_requests_is_saved_not_rendered(owner_client):
    r = owner_client.get("/api/schema/", HTTP_ACCEPT="application/vnd.oai.openapi+json")
    assert r.status_code == 200
    assert r["Content-Disposition"].startswith("attachment;")  # the view said "inline"; it is saved all the same


@pytest.mark.parametrize(
    "content_type", ["text/html", "text/plain", "image/webp", "application/pdf", "application/jsonp"]
)
def test_other_types_are_left_alone(content_type):
    from django.http import HttpResponse
    from django.test import RequestFactory

    from apps.core.middleware import SecurityHeadersMiddleware

    response = SecurityHeadersMiddleware(lambda r: HttpResponse("x", content_type=content_type))(
        RequestFactory().get("/api/x")
    )
    assert "Content-Disposition" not in response
