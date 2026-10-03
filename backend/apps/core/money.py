"""Money is an integer number of toman. This is the one place where fractions are rounded away."""

from decimal import ROUND_HALF_UP, Decimal


def round_half_up(value: Decimal | int | str) -> int:
    """Round to a whole toman, halves away from zero (0.5 → 1, 2.5 → 3)."""
    return int(Decimal(value).quantize(Decimal(1), rounding=ROUND_HALF_UP))


def round_to_step(value: Decimal | int | str, step: int) -> int:
    """Round to the nearest multiple of `step` (halves up); a step of 1 or less just rounds to a toman."""
    if step <= 1:
        return round_half_up(value)
    return round_half_up(Decimal(value) / step) * step
