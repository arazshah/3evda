import pytest

from apps.cms.models import SiteSettings

from .conftest import PASSWORD, csrf


@pytest.fixture
def two_factor_off(db):
    SiteSettings.objects.update_or_create(pk=1, defaults={"require_two_factor": False})


def test_two_factor_is_off_by_default():
    assert SiteSettings._meta.get_field("require_two_factor").default is False


def test_password_alone_signs_in_while_off(api, owner, two_factor_off):
    csrf(api)
    response = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert response.json()["state"] == "verified"
    assert api.get("/api/admin/cms/settings").status_code == 200


def test_anonymous_stays_anonymous_while_off(api, two_factor_off):
    assert api.get("/api/auth/me").json()["state"] == "anonymous"
    assert api.get("/api/admin/cms/settings").status_code in (401, 403)


def test_owner_turns_it_on_with_password(api, owner, two_factor_off):
    csrf(api)
    api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    bad = api.post("/api/auth/two-factor", {"enabled": True, "password": "wrong"}, format="json")
    assert bad.status_code == 400
    assert SiteSettings.load().require_two_factor is False
    ok = api.post("/api/auth/two-factor", {"enabled": True, "password": PASSWORD}, format="json")
    assert ok.json() == {"enabled": True}
    assert SiteSettings.load().require_two_factor is True
    assert api.get("/api/auth/me").json()["state"] == "enrollment_required"


def test_owner_turns_it_off_from_a_verified_session(verified):
    response = verified.post("/api/auth/two-factor", {"enabled": False, "password": PASSWORD}, format="json")
    assert response.json() == {"enabled": False}
    assert SiteSettings.load().require_two_factor is False


def test_flag_is_not_in_public_or_site_settings_payloads(verified):
    assert "require_two_factor" not in verified.get("/api/admin/cms/settings").json()
    assert "require_two_factor" not in verified.get("/api/public/site").json()["settings"]
