from typing import Any

from rest_framework import exceptions
from rest_framework.response import Response
from rest_framework.views import exception_handler as drf_exception_handler

_MESSAGES = {
    exceptions.NotAuthenticated: ("not_authenticated", "ابتدا وارد شوید."),
    exceptions.PermissionDenied: ("permission_denied", "اجازه‌ی این کار را ندارید."),
    exceptions.Throttled: ("throttled", "درخواست‌ها زیاد بود؛ کمی بعد دوباره امتحان کنید."),
    exceptions.NotFound: ("not_found", "پیدا نشد."),
}


def exception_handler(exc: Exception, context: dict[str, Any]) -> Response | None:
    """DRF errors as `{code, detail}` (plus `fields` for validation errors), with Persian messages."""
    response = drf_exception_handler(exc, context)
    if response is None:
        return None
    if isinstance(exc, exceptions.ValidationError):
        response.data = {"code": "invalid", "detail": "ورودی نامعتبر است.", "fields": response.data}
        return response
    for exc_type, (code, detail) in _MESSAGES.items():
        if isinstance(exc, exc_type):
            response.data = {"code": code, "detail": detail}
            return response
    response.data = {"code": "error", "detail": str(getattr(exc, "detail", "خطا"))}
    return response
