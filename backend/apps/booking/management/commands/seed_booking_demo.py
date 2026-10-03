from django.core.management.base import BaseCommand

from apps.booking.models import BookingSettings, SessionType, WorkingHours

# Python weekdays: Monday 0 … Saturday 5, Sunday 6. Saturday to Thursday, 10:00–18:00.
WORKING_DAYS = [5, 6, 0, 1, 2, 3]

TYPES = [
    ("studio", "عکاسی در استودیو", "Studio session", 120, 30),
    ("on-site", "عکاسی در محل", "On-site shoot", 180, 60),
    ("product-drop-off", "تحویل محصول", "Product drop-off", 60, 0),
]


class Command(BaseCommand):
    help = "Sample session types and weekly hours (only when none exist), so the booking flow can be tried and tested."

    def handle(self, *args: object, **options: object) -> None:
        BookingSettings.load()
        created = 0
        if not SessionType.objects.exists():
            for position, (key, fa, en, minutes, buffer) in enumerate(TYPES):
                SessionType.objects.create(
                    key=key,
                    title_fa=fa,
                    title_en=en,
                    duration_minutes=minutes,
                    buffer_minutes=buffer,
                    position=position,
                )
                created += 1
        if not WorkingHours.objects.exists():
            from datetime import time

            for weekday in WORKING_DAYS:
                WorkingHours.objects.create(weekday=weekday, start=time(10), end=time(18))
                created += 1
        self.stdout.write(f"Sample booking setup ready ({created} created).")
