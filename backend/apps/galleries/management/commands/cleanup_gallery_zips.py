from typing import Any

from django.core.management.base import BaseCommand

from apps.galleries.tasks import cleanup_zips


class Command(BaseCommand):
    help = "Remove expired gallery archives now (the worker also does this every hour)."

    def handle(self, *args: Any, **options: Any) -> None:
        self.stdout.write(f"removed {cleanup_zips()} archive record(s)")
