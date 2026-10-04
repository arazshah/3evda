"""What a client holds after unlocking a gallery: a short-lived token for that one gallery.

The token is `<expires>.<signature>`. The signature covers the gallery, its link version and a digest of its
password, so a new link or a changed password ends every open session. Nothing is stored on the server.
"""

import hashlib
import hmac
import time

from django.conf import settings
from django.core.cache import cache
from django.utils.crypto import constant_time_compare

from .models import Gallery

TOKEN_TTL = 12 * 3600
HEADER = "X-Gallery-Token"

# Wrong passwords: few per visitor, more per gallery. Only wrong guesses count.
PER_VISITOR = (5, 15 * 60)
PER_GALLERY = (30, 3600)


def _signature(gallery: Gallery, expires: int) -> str:
    secret = hashlib.sha256(gallery.password_hash.encode()).hexdigest()
    message = f"gallery-access:{gallery.public_id}:{gallery.link_version}:{secret}:{expires}".encode()
    return hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).hexdigest()


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
    return bool(constant_time_compare(signature, _signature(gallery, expires)))


def _keys(gallery: Gallery, visitor: str) -> tuple[str, str]:
    return f"gallery-fail:{gallery.pk}:{visitor}", f"gallery-fail-all:{gallery.pk}"


def guessing_blocked(gallery: Gallery, visitor: str) -> bool:
    mine, everyone = _keys(gallery, visitor)
    return bool(cache.get(mine, 0) >= PER_VISITOR[0] or cache.get(everyone, 0) >= PER_GALLERY[0])


def note_wrong_password(gallery: Gallery, visitor: str) -> None:
    for key, (_, window) in zip(_keys(gallery, visitor), (PER_VISITOR, PER_GALLERY), strict=True):
        cache.add(key, 0, timeout=window)
        try:
            cache.incr(key)
        except ValueError:  # expired between the two calls
            cache.set(key, 1, timeout=window)
