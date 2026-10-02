from typing import Any

from django.http import HttpRequest
from rest_framework.permissions import BasePermission


def is_verified_owner(user: Any) -> bool:
    return bool(user and user.is_authenticated and user.is_staff and user.is_verified())


class IsVerifiedOwner(BasePermission):
    """The site owner, signed in with password *and* a second factor."""

    message = "ورود دومرحله‌ای لازم است."

    def has_permission(self, request: HttpRequest, view: Any) -> bool:
        return is_verified_owner(request.user)


class HasPasswordSession(BasePermission):
    """Signed in with the password; the second factor may still be pending."""

    def has_permission(self, request: HttpRequest, view: Any) -> bool:
        return bool(request.user and request.user.is_authenticated)
