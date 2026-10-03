"""Cache of the public journal responses.

Scheduled publication needs no scheduler: an article is public as soon as its `published_at` has
passed. The cache must not hide that moment, so the key contains the number of articles that are
visible *now* (it changes the instant one becomes visible) and the entry never outlives the next
scheduled publication. Every change made in the panel bumps the version.
"""

import math
from collections.abc import Callable
from datetime import datetime
from typing import Any

from django.core.cache import cache
from django.db.models import Min
from django.utils import timezone

from .models import Article

VERSION_KEY = "blog:version"
MAX_TTL = 30


def bump_version() -> None:
    try:
        cache.incr(VERSION_KEY)
    except ValueError:
        cache.set(VERSION_KEY, 2, None)


def ttl_until(next_publication: datetime | None, now: datetime) -> int:
    """Seconds an entry may live: at most MAX_TTL and never past the next scheduled publication (0 = don't cache)."""
    if next_publication is None:
        return MAX_TTL
    return max(0, min(MAX_TTL, math.floor((next_publication - now).total_seconds())))


def cached(request_path: str, build: Callable[[], Any]) -> Any:
    now = timezone.now()
    visible = Article.objects.filter(status=Article.Status.PUBLISHED, published_at__lte=now).count()
    version = cache.get_or_set(VERSION_KEY, 1, None)
    key = f"blog:{version}:{visible}:{request_path}"
    hit = cache.get(key)
    if hit is not None:
        return hit
    data = build()
    upcoming = Article.objects.filter(status=Article.Status.PUBLISHED, published_at__gt=now).aggregate(
        at=Min("published_at")
    )["at"]
    ttl = ttl_until(upcoming, now)
    if ttl > 0:
        cache.set(key, data, ttl)
    return data
