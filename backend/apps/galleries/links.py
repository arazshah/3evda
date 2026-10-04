"""The client's link to a gallery: `<public id>_<signature>` (no dot; see proformas.links).

The signature covers the link version, so «new link» cancels every link given out before.
"""

import base64
import hashlib
import hmac
import uuid

from django.conf import settings

from apps.core.signing import current_key, signature_matches

from .models import Gallery

SEPARATOR = "_"
ID_LENGTH = 32


def _signature(public_id: uuid.UUID, version: int, key: str | None = None) -> str:
    message = f"gallery-link:{public_id}:{version}".encode()
    digest = hmac.new((key or current_key()).encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_token(gallery: Gallery) -> str:
    return f"{gallery.public_id.hex}{SEPARATOR}{_signature(gallery.public_id, gallery.link_version)}"


def public_url(gallery: Gallery) -> str:
    prefix = "/en" if gallery.language == "en" else ""
    return f"{settings.PUBLIC_URL.rstrip('/')}{prefix}/g/{make_token(gallery)}"


def find_by_token(token: str) -> Gallery | None:
    public_hex, separator, signature = token[:ID_LENGTH], token[ID_LENGTH : ID_LENGTH + 1], token[ID_LENGTH + 1 :]
    if separator != SEPARATOR:
        return None
    try:
        public_id = uuid.UUID(hex=public_hex)
    except ValueError:
        return None
    gallery = Gallery.objects.filter(public_id=public_id).first()
    if gallery is None:
        return None
    ok = signature_matches(signature, lambda key: _signature(gallery.public_id, gallery.link_version, key))
    return gallery if ok else None
