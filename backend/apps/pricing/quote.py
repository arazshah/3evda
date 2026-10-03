"""The price estimate: a pure function of the rules and the visitor's choices.

    total = ((base × quantity) × tier factor + add-ons) × Π multipliers

The result shown to visitors is a range around `total` (and always «approximate»). No database access
and no floats here, so the whole table of cases can be tested directly.
"""

from dataclasses import dataclass, field
from decimal import Decimal

from apps.core.money import round_half_up, round_to_step

SERVICE = "service"
TIER = "tier"
ADDON_FIXED = "addon_fixed"
ADDON_PER_ITEM = "addon_per_item"
MULTIPLIER = "multiplier"


class QuoteError(ValueError):
    def __init__(self, code: str, detail: str) -> None:
        super().__init__(detail)
        self.code = code
        self.detail = detail


@dataclass(frozen=True)
class Rule:
    key: str
    kind: str
    amount: int | None = None
    factor: Decimal | None = None
    min_quantity: int | None = None


@dataclass(frozen=True)
class Limits:
    range_percent: int = 15
    rounding_step: int = 10_000
    min_quantity: int = 1
    max_quantity: int = 200


@dataclass(frozen=True)
class Estimate:
    low: int
    high: int
    total: int
    base: int
    tier_factor: Decimal
    addons: list[tuple[str, int]] = field(default_factory=list)
    multipliers: list[tuple[str, Decimal]] = field(default_factory=list)


def _pick(rules: list[Rule], kind: str, key: str) -> Rule:
    for rule in rules:
        if rule.kind == kind and rule.key == key:
            return rule
    raise QuoteError("unknown_option", "گزینه‌ی انتخاب‌شده معتبر نیست.")


def estimate(
    rules: list[Rule],
    limits: Limits,
    *,
    service: str,
    quantity: int,
    addons: list[str],
    multipliers: list[str],
) -> Estimate:
    if not limits.min_quantity <= quantity <= limits.max_quantity:
        raise QuoteError("bad_quantity", f"تعداد باید بین {limits.min_quantity} و {limits.max_quantity} باشد.")

    base_rule = _pick(rules, SERVICE, service)
    base = (base_rule.amount or 0) * quantity

    # The tier with the highest threshold the quantity reaches (ties: the first rule given).
    tiers = [r for r in rules if r.kind == TIER and r.min_quantity is not None and r.min_quantity <= quantity]
    tier = max(tiers, key=lambda r: r.min_quantity or 0, default=None)
    tier_factor = tier.factor if tier and tier.factor is not None else Decimal(1)
    subtotal = Decimal(base) * tier_factor

    chosen_addons: list[tuple[str, int]] = []
    for key in dict.fromkeys(addons):  # de-duplicated, order kept
        rule = next((r for r in rules if r.key == key and r.kind in (ADDON_FIXED, ADDON_PER_ITEM)), None)
        if rule is None:
            raise QuoteError("unknown_option", "گزینه‌ی انتخاب‌شده معتبر نیست.")
        amount = (rule.amount or 0) * (quantity if rule.kind == ADDON_PER_ITEM else 1)
        chosen_addons.append((key, amount))

    chosen_multipliers: list[tuple[str, Decimal]] = []
    total = subtotal + sum(amount for _, amount in chosen_addons)
    for key in dict.fromkeys(multipliers):
        rule = _pick(rules, MULTIPLIER, key)
        factor = rule.factor if rule.factor is not None else Decimal(1)
        chosen_multipliers.append((key, factor))
        total *= factor

    spread = Decimal(limits.range_percent)
    low = round_to_step(total * (100 - spread) / 100, limits.rounding_step)
    high = round_to_step(total * (100 + spread) / 100, limits.rounding_step)
    return Estimate(
        low=low,
        high=high,
        total=round_half_up(total),
        base=base,
        tier_factor=tier_factor,
        addons=chosen_addons,
        multipliers=chosen_multipliers,
    )
