import pytest
from django.contrib.sessions.models import Session
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient

from apps.audit.models import AuditLog

from .conftest import PASSWORD, code_for, csrf


def state(api: APIClient) -> str:
    return api.get("/api/auth/me").json()["state"]


@pytest.mark.django_db
def test_anonymous_state(api):
    response = api.get("/api/auth/me")
    assert response.status_code == 200
    assert response.json() == {"state": "anonymous", "user": None}


def test_login_requires_csrf(api, enrolled_owner):
    response = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert response.status_code == 403


def test_wrong_password_is_rejected_without_detail(api, enrolled_owner):
    csrf(api)
    response = api.post("/api/auth/login", {"username": "owner", "password": "wrong-password-0"}, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_credentials"
    assert state(api) == "anonymous"


def test_login_response_reports_the_next_step(api, enrolled_owner, owner):
    csrf(api)
    response = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert response.json() == {"state": "otp_required", "user": {"username": "owner", "display_name": ""}}


def test_login_response_asks_for_enrollment_on_first_sign_in(api, owner):
    csrf(api)
    response = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert response.json()["state"] == "enrollment_required"


def test_password_alone_does_not_grant_admin_access(logged_in):
    assert state(logged_in) == "otp_required"
    assert logged_in.get("/api/schema/").status_code == 403


def test_totp_code_completes_sign_in(verified):
    assert state(verified) == "verified"
    me = verified.get("/api/auth/me").json()
    assert me["user"]["username"] == "owner"
    assert AuditLog.objects.filter(action="auth.login").exists()


def test_wrong_totp_code_is_rejected(logged_in):
    response = logged_in.post("/api/auth/verify", {"code": "000000"}, format="json")
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_code"
    assert state(logged_in) == "otp_required"


def test_recovery_code_works_once(logged_in, enrolled_owner):
    device = StaticDevice.objects.create(user=enrolled_owner, name="recovery")
    StaticToken.objects.create(device=device, token="abcd2345")

    assert logged_in.post("/api/auth/verify", {"code": "abcd2345"}, format="json").status_code == 200
    assert AuditLog.objects.filter(action="auth.recovery_code_used").exists()

    logged_in.post("/api/auth/logout")
    csrf(logged_in)
    logged_in.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert logged_in.post("/api/auth/verify", {"code": "abcd2345"}, format="json").status_code == 400


def test_lockout_after_repeated_failures(api, enrolled_owner):
    csrf(api)
    for _ in range(5):
        api.post("/api/auth/login", {"username": "owner", "password": "wrong-password-0"}, format="json")
    response = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert response.status_code == 429
    assert response.json()["code"] == "locked_out"
    assert state(api) == "anonymous"


def test_first_login_requires_enrollment_and_returns_recovery_codes(api, owner):
    csrf(api)
    api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert state(api) == "enrollment_required"

    setup = api.get("/api/auth/totp/setup").json()
    assert setup["otpauth_uri"].startswith("otpauth://totp/")
    assert "3evda.com" in setup["otpauth_uri"]
    assert setup["qr_data_uri"].startswith("data:image/svg+xml")
    assert "xmlns" in setup["qr_data_uri"]  # required for the SVG to render inside <img>
    assert len(setup["secret"]) >= 16

    # Refreshing the setup page keeps the same secret.
    assert api.get("/api/auth/totp/setup").json()["secret"] == setup["secret"]

    device = TOTPDevice.objects.get(user=owner, confirmed=False)
    response = api.post("/api/auth/totp/confirm", {"code": code_for(device)}, format="json")
    assert response.status_code == 200
    codes = response.json()["recovery_codes"]
    assert len(codes) == 10 and len(set(codes)) == 10
    assert state(api) == "verified"
    assert AuditLog.objects.filter(action="auth.totp_enrolled").exists()


def test_setup_is_refused_once_totp_is_enrolled(logged_in):
    assert logged_in.get("/api/auth/totp/setup").status_code == 409


def test_setup_requires_a_password_session(api, owner):
    assert api.get("/api/auth/totp/setup").status_code == 403


def test_regenerating_recovery_codes_requires_the_password(verified, enrolled_owner):
    assert verified.post("/api/auth/recovery-codes", {"password": "nope-nope-nope"}, format="json").status_code == 400
    response = verified.post("/api/auth/recovery-codes", {"password": PASSWORD}, format="json")
    assert response.status_code == 200
    assert len(response.json()["recovery_codes"]) == 10
    assert StaticToken.objects.filter(device__user=enrolled_owner).count() == 10


def test_password_change_keeps_this_session_and_ends_the_others(verified, enrolled_owner):
    other = APIClient()
    other.force_login(enrolled_owner)
    assert Session.objects.count() == 2

    response = verified.post(
        "/api/auth/password",
        {"current_password": PASSWORD, "new_password": "another-long-password-456"},
        format="json",
    )
    assert response.status_code == 200
    assert state(verified) == "verified"
    assert other.get("/api/auth/me").json()["state"] == "anonymous"
    enrolled_owner.refresh_from_db()
    assert enrolled_owner.check_password("another-long-password-456")


def test_password_change_validates_the_new_password(verified):
    response = verified.post(
        "/api/auth/password", {"current_password": PASSWORD, "new_password": "short"}, format="json"
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_password"


def test_password_change_requires_the_current_password(verified):
    response = verified.post(
        "/api/auth/password",
        {"current_password": "wrong-password-0", "new_password": "another-long-password-456"},
        format="json",
    )
    assert response.status_code == 400
    assert response.json()["code"] == "invalid_credentials"


def test_logout_ends_the_session(verified):
    assert verified.post("/api/auth/logout").status_code == 204
    assert state(verified) == "anonymous"


def test_django_admin_requires_otp(logged_in):
    response = logged_in.get("/django-admin/")
    assert response.status_code == 302  # back to the admin login, which asks for the OTP


@pytest.mark.parametrize(
    "new_password",
    [
        "a" * 128 + "-Z9",  # far longer than 64 characters: never truncated, never refused for length
        "a passphrase with several spaces in it 2026",  # spaces are allowed
        "گذرواژه‌ی-بسیار-طولانی-و-فارسی-۱۴۰۵",  # any Unicode
    ],
)
def test_long_passphrases_with_spaces_and_unicode_are_accepted_whole(verified, enrolled_owner, new_password):
    response = verified.post(
        "/api/auth/password", {"current_password": PASSWORD, "new_password": new_password}, format="json"
    )
    assert response.status_code == 200, response.content
    enrolled_owner.refresh_from_db()
    assert enrolled_owner.check_password(new_password)  # the whole thing, not a cut-off prefix
    assert not enrolled_owner.check_password(new_password[:-1])  # nothing is cut off the end


def test_signing_in_gives_a_new_session_key(api, enrolled_owner, settings):
    from django.conf import settings as django_settings

    csrf(api)
    anonymous = api.session
    anonymous["probe"] = 1  # a session an attacker could have planted before the visitor signed in
    anonymous.save()
    before = api.cookies[django_settings.SESSION_COOKIE_NAME].value
    r = api.post("/api/auth/login", {"username": "owner", "password": PASSWORD}, format="json")
    assert r.status_code == 200
    after = api.cookies[django_settings.SESSION_COOKIE_NAME].value
    assert after != before
