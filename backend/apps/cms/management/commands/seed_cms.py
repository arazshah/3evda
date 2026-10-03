from typing import Any

from django.core.management.base import BaseCommand

from apps.cms.models import SiteSettings
from apps.cms.service import ensure_blocks


class Command(BaseCommand):
    help = "Create the site settings row and any missing editable text blocks (safe to run repeatedly)."

    def handle(self, *args: Any, **options: Any) -> None:
        SiteSettings.load()
        created = ensure_blocks()
        self.stdout.write(self.style.SUCCESS(f"CMS ready ({created} new text blocks)."))
