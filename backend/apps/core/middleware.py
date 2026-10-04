import re
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse

from .logging import request_id_var

_SAFE_ID = re.compile(r"^[A-Za-z0-9_-]{1,64}$")


class RequestIDMiddleware:
    """Accepts a well-formed X-Request-ID from the gateway or generates one."""

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        incoming = request.headers.get("X-Request-ID", "")
        request_id = incoming if _SAFE_ID.fullmatch(incoming) else uuid.uuid4().hex
        token = request_id_var.set(request_id)
        try:
            response = self.get_response(request)
        finally:
            request_id_var.reset(token)
        response["X-Request-ID"] = request_id
        return response


PERMISSIONS_POLICY = (
    "accelerometer=(), camera=(), geolocation=(), gyroscope=(), magnetometer=(), microphone=(), "
    "payment=(), usb=(), interest-cohort=()"
)
PRIVATE_PREFIXES = ("/api/admin/", "/api/auth/")


class SecurityHeadersMiddleware:
    """Headers every API answer carries, whatever view made it.

    The gateway sets the same ones for everything it serves; having them here as well means they hold
    even if the API is ever reached some other way. Answers about the owner or from the panel are never cached.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        response = self.get_response(request)
        response.setdefault("Permissions-Policy", PERMISSIONS_POLICY)
        response.setdefault("Cross-Origin-Resource-Policy", "same-site")
        if request.path.startswith(PRIVATE_PREFIXES) and "Cache-Control" not in response:
            response["Cache-Control"] = "private, no-store"
        return response
