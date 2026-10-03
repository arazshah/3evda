"""The arithmetic of a proforma, in one place and in whole toman.

Order is fixed so every total can be reproduced by hand:

    subtotal = Σ quantity × unit price
    discount = the fixed amount, or round(subtotal × percent / 100); never more than the subtotal
    taxable  = subtotal − discount
    tax      = round(taxable × tax percent / 100)
    total    = taxable + tax

Only the two percentages are ever rounded (half up, once each).
"""

from collections.abc import Iterable
from dataclasses import dataclass
from decimal import Decimal

from apps.core.money import round_half_up


@dataclass(frozen=True)
class Totals:
    subtotal: int
    discount: int
    taxable: int
    tax: int
    total: int


def line_total(quantity: int, unit_price: int) -> int:
    return quantity * unit_price


def compute_totals(
    lines: Iterable[tuple[int, int]],
    *,
    discount_amount: int = 0,
    discount_percent: Decimal = Decimal(0),
    tax_percent: Decimal = Decimal(0),
) -> Totals:
    subtotal = sum(line_total(quantity, price) for quantity, price in lines)
    discount = round_half_up(Decimal(subtotal) * discount_percent / 100) if discount_percent else discount_amount
    discount = min(discount, subtotal)
    taxable = subtotal - discount
    tax = round_half_up(Decimal(taxable) * tax_percent / 100) if tax_percent else 0
    return Totals(subtotal=subtotal, discount=discount, taxable=taxable, tax=tax, total=taxable + tax)
