import re
import uuid
from collections.abc import Callable

from django.http import HttpRequest, HttpResponse, JsonResponse

from . import backup_window
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
        # An API answer is data, never a page: if a browser is ever pointed at one it saves the file instead of
        # rendering it (ASVS 14.4.2). `fetch` does not care. Answers that choose their own name keep it.
        if (
            request.path.startswith("/api/")
            and response.get("Content-Type", "").startswith("application/json")
            and "Content-Disposition" not in response
        ):
            response["Content-Disposition"] = 'attachment; filename="api.json"'
        return response


SAFE_METHODS = frozenset({"GET", "HEAD", "OPTIONS"})
BACKUP_RETRY_AFTER_SECONDS = 300


class BackupWindowMiddleware:
    """While the nightly backup copies the data, anything that writes is told to come back in a few minutes.

    Writes that are let in are counted until they finish, so the backup can wait for them. Reading, health
    checks and public pages keep working. See `backup_window` for the other half.
    """

    def __init__(self, get_response: Callable[[HttpRequest], HttpResponse]) -> None:
        self.get_response = get_response

    def __call__(self, request: HttpRequest) -> HttpResponse:
        if request.method in SAFE_METHODS:
            return self.get_response(request)
        admission = backup_window.enter_write()
        if admission is backup_window.Admission.REFUSED:
            response = JsonResponse(
                {
                    "code": "backup_in_progress",
                    "detail": "سایت برای چند دقیقه در حال پشتیبان‌گیری است؛ کمی بعد دوباره امتحان کنید.",
                },
                status=503,
            )
            response["Retry-After"] = str(BACKUP_RETRY_AFTER_SECONDS)
            response["Cache-Control"] = "no-store"
            return response
        try:
            return self.get_response(request)
        finally:
            if admission is backup_window.Admission.COUNTED:
                backup_window.leave_write()
