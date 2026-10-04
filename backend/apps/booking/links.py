"""The customer's link to see or cancel their booking: `<public id>_<signature>` (no dot; see proformas.links)."""

import base64
import hashlib
import hmac
import uuid

from django.conf import settings

from apps.core.signing import current_key, signature_matches

from .models import Booking

SEPARATOR = "_"
ID_LENGTH = 32


def _signature(public_id: uuid.UUID, key: str | None = None) -> str:
    digest = hmac.new((key or current_key()).encode(), f"booking-link:{public_id}".encode(), hashlib.sha256).digest()
    return base64.urlsafe_b64encode(digest).rstrip(b"=").decode()


def make_token(booking: Booking) -> str:
    return f"{booking.public_id.hex}{SEPARATOR}{_signature(booking.public_id)}"


def public_url(booking: Booking) -> str:
    prefix = "/en" if booking.language == "en" else ""
    return f"{settings.PUBLIC_URL.rstrip('/')}{prefix}/b/{make_token(booking)}"


def find_by_token(token: str) -> Booking | None:
    public_hex, separator, signature = token[:ID_LENGTH], token[ID_LENGTH : ID_LENGTH + 1], token[ID_LENGTH + 1 :]
    if separator != SEPARATOR:
        return None
    try:
        public_id = uuid.UUID(hex=public_hex)
    except ValueError:
        return None
    booking = Booking.objects.filter(public_id=public_id).select_related("session_type").first()
    if booking is None:
        return None
    return booking if signature_matches(signature, lambda key: _signature(booking.public_id, key)) else None
