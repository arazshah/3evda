from typing import Any

from . import quote
from .models import QuoteRule, QuoteSettings


def rules() -> list[quote.Rule]:
    return [
        quote.Rule(r.key, r.kind, r.amount, r.factor, r.min_quantity) for r in QuoteRule.objects.filter(is_active=True)
    ]


def limits() -> quote.Limits:
    s = QuoteSettings.load()
    return quote.Limits(s.range_percent, s.rounding_step, s.min_quantity, s.max_quantity)


def run_estimate(data: dict[str, Any]) -> quote.Estimate:
    """The estimate for validated input; raises `quote.QuoteError` for choices that do not exist."""
    return quote.estimate(
        rules(),
        limits(),
        service=data["service"],
        quantity=data["quantity"],
        addons=data.get("addons", []),
        multipliers=data.get("multipliers", []),
    )
