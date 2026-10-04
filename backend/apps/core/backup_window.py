"""The "backup window": a Redis key that says the nightly backup is taking its one-moment copy.

While it is set, the API refuses everything that writes (see `BackupWindowMiddleware`) and the worker
does not take new jobs, so the database dump and the file copy describe the same moment. The key has
its own expiry, so a backup that dies halfway can never leave the site read-only for long.
"""

import redis
from django.conf import settings

WINDOW_KEY = "threevda:backup-window"
WINDOW_TTL_SECONDS = 30 * 60


def _client() -> redis.Redis:
    return redis.Redis.from_url(settings.REDIS_URL, socket_timeout=1, socket_connect_timeout=1)


def open_window(ttl: int = WINDOW_TTL_SECONDS) -> None:
    client = _client()
    try:
        client.set(WINDOW_KEY, "1", ex=ttl)
    finally:
        client.close()


def close_window() -> None:
    client = _client()
    try:
        client.delete(WINDOW_KEY)
    finally:
        client.close()


def is_open() -> bool:
    """Redis being down must not make the whole site read-only, so an error counts as "closed"."""
    try:
        client = _client()
        try:
            return bool(client.exists(WINDOW_KEY))
        finally:
            client.close()
    except redis.RedisError:
        return False
