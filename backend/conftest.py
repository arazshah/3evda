import pytest
from django.contrib.auth import get_user_model
from django_otp import DEVICE_ID_SESSION_KEY
from django_otp.plugins.otp_totp.models import TOTPDevice
from rest_framework.test import APIClient


@pytest.fixture(autouse=True)
def _clear_cache():  # type: ignore[no-untyped-def]
    """Throttle counters live in the cache; every test starts from zero."""
    from django.core.cache import cache

    cache.clear()
    yield
    cache.clear()


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


@pytest.fixture
def s3_buckets(settings):  # type: ignore[no-untyped-def]
    """In-memory S3 (moto) with the private and public buckets created."""
    import boto3
    from moto import mock_aws

    from apps.core.management.commands.ensure_buckets import ensure_buckets

    settings.S3_ENDPOINT_URL = None  # moto intercepts the default AWS endpoint
    with mock_aws():
        ensure_buckets()
        yield boto3.client("s3", region_name=settings.S3_REGION)


class FakeRedis:
    """Just enough of redis.Redis for the backup window: keys with expiry, counters, a pipeline."""

    store: dict[str, tuple[object, int | None]] = {}

    def set(self, key, value, ex=None):  # type: ignore[no-untyped-def]
        self.store[key] = (value, ex)

    def get(self, key):  # type: ignore[no-untyped-def]
        item = self.store.get(key)
        return None if item is None else item[0]

    def exists(self, key):  # type: ignore[no-untyped-def]
        return int(key in self.store)

    def delete(self, key):  # type: ignore[no-untyped-def]
        self.store.pop(key, None)

    def incr(self, key):  # type: ignore[no-untyped-def]
        value = int(self.get(key) or 0) + 1
        self.store[key] = (value, (self.store.get(key) or (0, None))[1])
        return value

    def decr(self, key):  # type: ignore[no-untyped-def]
        value = int(self.get(key) or 0) - 1
        self.store[key] = (value, (self.store.get(key) or (0, None))[1])
        return value

    def expire(self, key, seconds):  # type: ignore[no-untyped-def]
        if key in self.store:
            self.store[key] = (self.store[key][0], seconds)

    def pipeline(self):  # type: ignore[no-untyped-def]
        outer = self

        class Pipe:
            def __init__(self) -> None:
                self.calls: list[tuple[str, tuple[object, ...]]] = []

            def incr(self, *a):  # type: ignore[no-untyped-def]
                self.calls.append(("incr", a))

            def expire(self, *a):  # type: ignore[no-untyped-def]
                self.calls.append(("expire", a))

            def execute(self):  # type: ignore[no-untyped-def]
                return [getattr(outer, name)(*args) for name, args in self.calls]

        return Pipe()

    def close(self):  # type: ignore[no-untyped-def]
        pass


@pytest.fixture(autouse=True)
def fake_redis(monkeypatch):  # type: ignore[no-untyped-def]
    """The backup window key lives in Redis; tests use an in-memory stand-in (no server needed)."""
    from apps.core import backup_window

    FakeRedis.store = {}
    monkeypatch.setattr(backup_window, "_client", lambda: FakeRedis())
    yield FakeRedis
    FakeRedis.store = {}
