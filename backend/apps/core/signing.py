"""Signing keys for the links and tokens this site makes itself.

Everything new is signed with the current `SECRET_KEY`. When the key is changed, the old one goes into
`SECRET_KEY_FALLBACKS`: what it signed is still accepted (links already given to customers keep working),
and nothing new is signed with it. Remove the old key from the list once those links no longer matter.
"""

from collections.abc import Callable

from django.conf import settings
from django.utils.crypto import constant_time_compare


def current_key() -> str:
    return str(settings.SECRET_KEY)


def accepted_keys() -> list[str]:
    return [current_key(), *map(str, settings.SECRET_KEY_FALLBACKS)]


def signature_matches(candidate: str, signed_with: Callable[[str], str]) -> bool:
    """True if `candidate` is what the current key or a fallback key produces.

    Every key is tried either way, so how long the check takes does not say which key (if any) matched.
    """
    matched = False
    for key in accepted_keys():
        matched |= bool(constant_time_compare(candidate, signed_with(key)))
    return matched
