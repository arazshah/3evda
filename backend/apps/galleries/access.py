"""What a client holds after unlocking a gallery: a short-lived token for that one gallery.

The token is `<expires>.<signature>`. The signature covers the gallery, its link version and a digest of its
password, so a new link or a changed password ends every open session. Nothing is stored on the server.
"""

import hashlib
import hmac
import time

from django.core.cache import cache

from apps.core.signing import current_key, signature_matches

from .models import Gallery

TOKEN_TTL = 12 * 3600
HEADER = "X-Gallery-Token"

# Wrong passwords: few per visitor, more per gallery. Only wrong guesses count.
PER_VISITOR = (5, 15 * 60)
PER_GALLERY = (30, 3600)


def _signature(gallery: Gallery, expires: int, key: str | None = None) -> str:
    secret = hashlib.sha256(gallery.password_hash.encode()).hexdigest()
    message = f"gallery-access:{gallery.public_id}:{gallery.link_version}:{secret}:{expires}".encode()
    return hmac.new((key or current_key()).encode(), message, hashlib.sha256).hexdigest()


def make_access_token(gallery: Gallery, now: float | None = None) -> str:
    expires = int((now if now is not None else time.time()) + TOKEN_TTL)
    return f"{expires}.{_signature(gallery, expires)}"


def check_access_token(gallery: Gallery, token: str, now: float | None = None) -> bool:
    expires_text, _, signature = token.partition(".")
    if not expires_text.isdigit():
        return False
    expires = int(expires_text)
    if expires <= (now if now is not None else time.time()):
        return False
    return signature_matches(signature, lambda key: _signature(gallery, expires, key))


def _keys(gallery: Gallery, visitor: str) -> tuple[str, str]:
    return f"gallery-fail:{gallery.pk}:{visitor}", f"gallery-fail-all:{gallery.pk}"


def _bump(key: str, window: int, step: int) -> int:
    cache.add(key, 0, timeout=window)
    try:
        value = int(cache.incr(key, step))
    except ValueError:  # expired between the two calls
        value = step
    if value < 0:
        value = 0
    if value != cache.get(key):
        cache.set(key, value, timeout=window)
    return value


def reserve_attempt(gallery: Gallery, visitor: str) -> bool:
    """Take one password try *before* checking the password, atomically (the counters only go up in one step).

    A burst of parallel requests therefore cannot test more passwords than the ceilings allow.
    Returns False when a ceiling is already used up.
    """
    mine, everyone = _keys(gallery, visitor)
    used_mine = _bump(mine, PER_VISITOR[1], 1)
    used_all = _bump(everyone, PER_GALLERY[1], 1)
    return used_mine <= PER_VISITOR[0] and used_all <= PER_GALLERY[0]


def release_attempt(gallery: Gallery, visitor: str) -> None:
    """The password was right: that try does not count against anyone."""
    mine, everyone = _keys(gallery, visitor)
    _bump(mine, PER_VISITOR[1], -1)
    _bump(everyone, PER_GALLERY[1], -1)
