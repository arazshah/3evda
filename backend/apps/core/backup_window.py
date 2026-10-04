"""The "backup window": a Redis key that says the nightly backup is taking its one-moment copy.

While it is set, the API refuses everything that writes (see `BackupWindowMiddleware`) and the worker
does not take new jobs, so the database dump and the file copy describe the same moment.

Two safeguards keep the site from being stuck or the copy from being torn:

* The key expires after a few minutes and the running backup keeps renewing it (`keepalive`), so a backup
  that dies leaves the site read-only for minutes, not for the length of a fixed timeout, while a long
  copy never loses its protection halfway.
* Writes already inside the API when the window opens are counted (`enter_write`/`leave_write`), and the
  backup waits for that count to reach zero (`wait_for_writes`) before it starts dumping.
"""

import enum
import logging
import threading
import time
from collections.abc import Callable, Iterator
from contextlib import contextmanager

import redis
from django.conf import settings

logger = logging.getLogger(__name__)

WINDOW_KEY = "threevda:backup-window"
WINDOW_TTL_SECONDS = 5 * 60
KEEPALIVE_SECONDS = 60
INFLIGHT_KEY = "threevda:writes-in-flight"
INFLIGHT_TTL_SECONDS = 15 * 60  # a crashed API process cannot leave the count above zero for long
WRITES_TIMEOUT_SECONDS = 5 * 60


class Admission(enum.Enum):
    REFUSED = "refused"  # the window is open
    COUNTED = "counted"  # let in, and counted until `leave_write`
    UNCOUNTED = "uncounted"  # let in, but Redis is unreachable so nothing was counted


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


@contextmanager
def keepalive(interval: float = KEEPALIVE_SECONDS) -> Iterator[None]:
    """Renews the window while the protected section runs, from its own thread."""
    stop = threading.Event()

    def renew() -> None:
        while not stop.wait(interval):
            try:
                open_window()
            except redis.RedisError:
                logger.warning("could not renew the backup window")

    thread = threading.Thread(target=renew, daemon=True)
    thread.start()
    try:
        yield
    finally:
        stop.set()
        thread.join(timeout=5)


def enter_write() -> Admission:
    """Called for every request that writes. Counts first, then looks at the window: a request is either
    counted before the backup looks at the count, or sees the window the backup opened first."""
    try:
        client = _client()
        try:
            pipe = client.pipeline()
            pipe.incr(INFLIGHT_KEY)
            pipe.expire(INFLIGHT_KEY, INFLIGHT_TTL_SECONDS)
            pipe.execute()
            if client.exists(WINDOW_KEY):
                leave_write()
                return Admission.REFUSED
            return Admission.COUNTED
        finally:
            client.close()
    except redis.RedisError:
        return Admission.UNCOUNTED


def leave_write() -> None:
    try:
        client = _client()
        try:
            if int(client.decr(INFLIGHT_KEY)) < 0:
                client.set(INFLIGHT_KEY, 0, ex=INFLIGHT_TTL_SECONDS)
        finally:
            client.close()
    except redis.RedisError:
        logger.warning("could not release a write slot")


def writes_in_flight() -> int:
    client = _client()
    try:
        return max(int(client.get(INFLIGHT_KEY) or 0), 0)
    finally:
        client.close()


def wait_for_writes(
    timeout: float = WRITES_TIMEOUT_SECONDS,
    *,
    count: Callable[[], int] = writes_in_flight,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> bool:
    """True once no write request is inside the API; False if some are still there after `timeout`."""
    deadline = clock() + timeout
    while count() > 0:
        if clock() >= deadline:
            return False
        sleep(1)
    return True
