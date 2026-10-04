import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[3]

PROD_ENV = {
    "DJANGO_SETTINGS_MODULE": "config.settings.prod",
    "DJANGO_SECRET_KEY": "x" * 50,
    "DJANGO_ALLOWED_HOSTS": "3evda.com",
    "PUBLIC_URL": "https://3evda.com",
    "POSTGRES_DB": "app",
    "POSTGRES_USER": "app",
    "POSTGRES_PASSWORD": "pw",
    "REDIS_URL": "redis://redis:6379/0",
    "S3_ENDPOINT_URL": "http://storage:8333",
    "S3_ACCESS_KEY": "key",
    "S3_SECRET_KEY": "secret",
}


PROBE = (
    "import django; django.setup(); from django.conf import settings; "
    "print(settings.DEBUG, settings.SESSION_COOKIE_SECURE, settings.CSRF_TRUSTED_ORIGINS)"
)


def _load_prod_settings(env: dict[str, str]) -> subprocess.CompletedProcess[str]:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "POSTGRES_", "S3_"))}
    return subprocess.run(
        [sys.executable, "-c", PROBE],
        cwd=BACKEND_DIR,
        env={**clean, **env},
        capture_output=True,
        text=True,
        check=False,
    )


def test_prod_settings_are_secure_by_default():
    result = _load_prod_settings(PROD_ENV)
    assert result.returncode == 0, result.stderr
    assert result.stdout.strip() == "False True ['https://3evda.com']"


def test_prod_settings_refuse_to_start_without_secret_key():
    env = {k: v for k, v in PROD_ENV.items() if k != "DJANGO_SECRET_KEY"}
    result = _load_prod_settings(env)
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


def test_prod_settings_reject_a_short_secret_key():
    result = _load_prod_settings({**PROD_ENV, "DJANGO_SECRET_KEY": "short"})
    assert result.returncode != 0
    assert "DJANGO_SECRET_KEY" in result.stderr


SESSION_PROBE = "import django; django.setup(); from django.conf import settings; print(settings.SESSION_COOKIE_NAME)"


def _session_cookie_name(env: dict[str, str]) -> str:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "POSTGRES_", "S3_", "COOKIE_"))}
    result = subprocess.run(
        [sys.executable, "-c", SESSION_PROBE],
        cwd=BACKEND_DIR,
        env={**clean, **env},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_the_session_cookie_carries_the_host_prefix_in_production():
    assert _session_cookie_name(PROD_ENV) == "__Host-threevda_session"


def test_the_prefix_is_dropped_only_where_cookies_are_not_secure():
    # Browsers refuse a "__Host-" cookie on plain http, so a local or CI stack that turns Secure off cannot use it.
    assert _session_cookie_name({**PROD_ENV, "COOKIE_SECURE": "false"}) == "threevda_session"


DEMO_PROBE = "import django; django.setup(); from django.conf import settings; print(settings.ALLOW_DEMO_DATA)"


def _allow_demo(env: dict[str, str]) -> str:
    clean = {k: v for k, v in os.environ.items() if not k.startswith(("DJANGO_", "POSTGRES_", "S3_", "ALLOW_"))}
    result = subprocess.run(
        [sys.executable, "-c", DEMO_PROBE],
        cwd=BACKEND_DIR,
        env={**clean, **env},
        capture_output=True,
        text=True,
        check=False,
    )
    assert result.returncode == 0, result.stderr
    return result.stdout.strip()


def test_sample_data_is_off_by_default_in_production():
    assert _allow_demo(PROD_ENV) == "False"


def test_only_an_explicit_switch_turns_sample_data_on():
    assert _allow_demo({**PROD_ENV, "ALLOW_DEMO_DATA": "true"}) == "True"
    assert _allow_demo({**PROD_ENV, "ALLOW_DEMO_DATA": "false"}) == "False"


def test_development_allows_sample_data():
    assert _allow_demo({**PROD_ENV, "DJANGO_SETTINGS_MODULE": "config.settings.dev"}) == "True"
