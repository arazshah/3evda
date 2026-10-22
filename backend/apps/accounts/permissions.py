from typing import Any

from django.http import HttpRequest
from rest_framework.permissions import BasePermission


def two_factor_required() -> bool:
    """Off by default; the owner switches it on from the Security page."""
    from apps.cms.models import SiteSettings

    return bool(SiteSettings.objects.filter(pk=1, require_two_factor=True).exists())


def is_verified_owner(user: Any) -> bool:
    if not (user and user.is_authenticated and user.is_staff):
        return False
    return bool(user.is_verified() or not two_factor_required())


class IsVerifiedOwner(BasePermission):
    """The site owner, signed in with the password (and a second factor while that is switched on)."""

    message = "ورود دومرحله‌ای لازم است."

    def has_permission(self, request: HttpRequest, view: Any) -> bool:
        return is_verified_owner(request.user)


class HasPasswordSession(BasePermission):
    """Signed in with the password; the second factor may still be pending."""

    def has_permission(self, request: HttpRequest, view: Any) -> bool:
        return bool(request.user and request.user.is_authenticated)
