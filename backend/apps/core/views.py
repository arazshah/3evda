import logging

from django.conf import settings
from django.http import HttpRequest, JsonResponse
from django.views.decorators.http import require_GET

from . import health

logger = logging.getLogger(__name__)


def _no_store(response: JsonResponse) -> JsonResponse:
    response["Cache-Control"] = "no-store"
    return response


@require_GET
def live(request: HttpRequest) -> JsonResponse:
    return _no_store(JsonResponse({"status": "ok", "version": settings.APP_VERSION}))


@require_GET
def ready(request: HttpRequest) -> JsonResponse:
    results: dict[str, str] = {}
    for name, func in health.CHECKS.items():
        try:
            getattr(health, func)()
            results[name] = "ok"
        except Exception:
            logger.warning("readiness check failed", extra={"check": name}, exc_info=True)
            results[name] = "error"
    healthy = all(v == "ok" for v in results.values())
    body = {"status": "ok" if healthy else "unavailable", "checks": results}
    return _no_store(JsonResponse(body, status=200 if healthy else 503))
