from decimal import Decimal

import pytest

from apps.core.money import round_half_up, round_to_step


@pytest.mark.parametrize(
    ("value", "expected"),
    [("0.5", 1), ("1.5", 2), ("2.5", 3), ("2.4999", 2), ("10000.1", 10000), ("-0.5", -1), (7, 7)],
)
def test_round_half_up_rounds_halves_away_from_zero(value, expected):
    assert round_half_up(Decimal(str(value))) == expected


@pytest.mark.parametrize(
    ("value", "step", "expected"),
    [
        ("1234567", 10000, 1230000),
        ("1235000", 10000, 1240000),
        ("1234999", 10000, 1230000),
        ("12.5", 1, 13),
        ("15", 10, 20),
    ],
)
def test_round_to_step(value, step, expected):
    assert round_to_step(Decimal(value), step) == expected
