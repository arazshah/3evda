from django.conf import settings
from django.core.management.base import CommandError


def require_demo_allowed(command: str) -> None:
    """Sample-data commands refuse to run on a real site (ASVS 14.2.2).

    They are for development, tests and the CI stack, which sets ALLOW_DEMO_DATA=true on purpose.
    """
    if not settings.ALLOW_DEMO_DATA:
        raise CommandError(
            f"{command} داده‌ی نمونه می‌سازد و روی سایت واقعی اجرا نمی‌شود. "
            f"(Sample data is refused here; only development and CI set ALLOW_DEMO_DATA=true.)"
        )
