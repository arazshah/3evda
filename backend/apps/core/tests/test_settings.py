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
