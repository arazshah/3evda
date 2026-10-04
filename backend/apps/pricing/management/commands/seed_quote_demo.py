from decimal import Decimal
from typing import Any

from django.core.management.base import BaseCommand

from apps.core.demo import require_demo_allowed
from apps.pricing.models import QuoteRule

SAMPLE: list[dict[str, Any]] = [
    {"key": "sample-food", "kind": "service", "label_fa": "عکاسی غذا", "label_en": "Food photography",
     "amount": 1_000_000},
    {"key": "sample-tier", "kind": "tier", "label_fa": "۱۰ محصول به بالا", "label_en": "10+ items",
     "factor": Decimal("0.90"), "min_quantity": 10},
    {"key": "sample-styling", "kind": "addon_per_item", "label_fa": "استایلینگ", "label_en": "Styling",
     "amount": 100_000},
    {"key": "sample-video", "kind": "addon_fixed", "label_fa": "ویدیوی کوتاه", "label_en": "Short video",
     "amount": 2_000_000},
    {"key": "sample-urgent", "kind": "multiplier", "label_fa": "تحویل فوری", "label_en": "Rush delivery",
     "factor": Decimal("1.50")},
]  # fmt: skip


class Command(BaseCommand):
    help = "Create a few sample price rules (for CI and local checks; safe to repeat; never run in production)."

    def handle(self, *args: Any, **options: Any) -> None:
        require_demo_allowed("seed_quote_demo")
        created = 0
        for position, row in enumerate(SAMPLE):
            _, new = QuoteRule.objects.get_or_create(key=row["key"], defaults={**row, "position": position})
            created += new
        self.stdout.write(f"Sample price rules ready ({created} created).")
