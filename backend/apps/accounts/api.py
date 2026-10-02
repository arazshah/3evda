from typing import Any

from django.http import HttpRequest, JsonResponse


def lockout_response(request: HttpRequest, credentials: Any = None, *args: Any, **kwargs: Any) -> JsonResponse:
    return JsonResponse(
        {"code": "locked_out", "detail": "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید."}, status=429
    )
