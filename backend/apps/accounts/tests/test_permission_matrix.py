"""Every admin endpoint must refuse anonymous visitors and password-only sessions.

Routes are discovered from the URL resolver, so a newly added endpoint is covered automatically.
"""

import re
import uuid

import pytest
from django.urls import URLPattern, URLResolver, get_resolver, resolve
from rest_framework.test import APIClient

from conftest import verify_client

PROTECTED_PREFIXES = ("api/admin/", "api/schema/", "api/auth/recovery-codes", "api/auth/password")


def _walk(patterns, prefix=""):  # type: ignore[no-untyped-def]
    for p in patterns:
        route = prefix + str(p.pattern)
        if isinstance(p, URLResolver):
            yield from _walk(p.url_patterns, route)
        elif isinstance(p, URLPattern):
            yield route


def _concrete(route: str) -> str:
    path = route.lstrip("^").rstrip("$").replace("\\Z", "").replace("\\.", ".")
    path = re.sub(r"<(?:\w+:)?pk>|\(\?P<pk>[^)]*\)", str(uuid.uuid4()), path)
    path = re.sub(r"\(\?P<format>[^)]*\)|\.\(\?P<format>[^)]*\)", "", path)
    path = re.sub(r"<[^>]+>|\(\?P<\w+>[^)]*\)", "x", path)
    return "/" + path.replace("^", "").replace("/?", "/")


ROUTES = sorted({_concrete(r) for r in _walk(get_resolver().url_patterns) if r.startswith(PROTECTED_PREFIXES)})


def test_routes_were_discovered_and_resolve():
    assert any(r.startswith("/api/admin/media/") for r in ROUTES)
    assert "/api/admin/settings/watermark" in ROUTES
    for route in ROUTES:
        resolve(route)  # the generated concrete paths really hit the views under test


@pytest.mark.django_db
@pytest.mark.parametrize("path", ROUTES)
@pytest.mark.parametrize("method", ["get", "post", "patch", "put", "delete"])
def test_anonymous_is_refused(path, method):
    assert getattr(APIClient(), method)(path).status_code in (401, 403)


@pytest.mark.parametrize("path", ROUTES)
@pytest.mark.parametrize("method", ["get", "post", "patch", "put", "delete"])
def test_password_only_session_is_refused(path, method, owner_user):
    client = APIClient()
    client.force_login(owner_user)
    assert getattr(client, method)(path).status_code in (401, 403)


@pytest.mark.parametrize("path", ROUTES)
def test_verified_owner_is_not_refused(path, owner_user):
    response = verify_client(APIClient(), owner_user).get(path)
    assert response.status_code not in (401, 403)
