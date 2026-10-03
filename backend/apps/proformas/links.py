"""The public address of a proforma: `<public id>_<signature>`.

No dot: a path that ends in something like ".js" is taken for a static file by proxies and caches.

The signature is an HMAC of the id and the link version under the server's secret key. Nothing secret is
stored, so a leaked database does not leak the links, the panel can show the same link at any time, and
bumping `link_version` cancels every link given out before.
"""

import base64
import hashlib
import hmac
import uuid

from django.conf import settings
from django.utils.crypto import constant_time_compare

from .models import Proforma


def _signature(public_id: uuid.UUID, version: int) -> str:
    message = f"proforma-link:{public_id}:{version}".encode()
    digest = hmac.new(settings.SECRET_KEY.encode(), message, hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


SEPARATOR = "_"
ID_LENGTH = 32  # a UUID in hex; it has no "_", so the first one always ends it


def make_token(proforma: Proforma) -> str:
    return f"{proforma.public_id.hex}{SEPARATOR}{_signature(proforma.public_id, proforma.link_version)}"


def public_url(proforma: Proforma) -> str:
    prefix = "/en" if proforma.language == "en" else ""
    return f"{settings.PUBLIC_URL.rstrip('/')}{prefix}/p/{make_token(proforma)}"


def find_by_token(token: str) -> Proforma | None:
    """The proforma this link belongs to, or None for anything that is not exactly a current link."""
    public_hex, separator, signature = token[:ID_LENGTH], token[ID_LENGTH : ID_LENGTH + 1], token[ID_LENGTH + 1 :]
    if separator != SEPARATOR:
        return None
    try:
        public_id = uuid.UUID(hex=public_hex)
    except ValueError:
        return None
    proforma = Proforma.objects.filter(public_id=public_id).exclude(status=Proforma.Status.DRAFT).first()
    if proforma is None:
        return None
    expected = _signature(proforma.public_id, proforma.link_version)
    return proforma if constant_time_compare(signature, expected) else None
