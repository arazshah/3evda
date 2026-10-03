from decimal import Decimal

import pytest

from apps.pricing import quote
from apps.pricing.models import QuoteRule, QuoteSettings
from apps.pricing.quote import Limits, QuoteError, Rule

pytestmark = pytest.mark.django_db

RULES = [
    Rule("food", quote.SERVICE, amount=1_000_000),
    Rule("product", quote.SERVICE, amount=800_000),
    Rule("t10", quote.TIER, factor=Decimal("0.9"), min_quantity=10),
    Rule("t30", quote.TIER, factor=Decimal("0.8"), min_quantity=30),
    Rule("styling", quote.ADDON_PER_ITEM, amount=100_000),
    Rule("video", quote.ADDON_FIXED, amount=2_000_000),
    Rule("urgent", quote.MULTIPLIER, factor=Decimal("1.5")),
]
EXACT = Limits(range_percent=0, rounding_step=1)  # no range, no step: the formula itself


def total(**kw):
    args = {"service": "food", "quantity": 1, "addons": [], "multipliers": []} | kw
    return quote.estimate(RULES, EXACT, **args).total


@pytest.mark.parametrize(
    ("choices", "expected"),
    [
        ({}, 1_000_000),  # one item, no tier
        ({"quantity": 5}, 5_000_000),  # below the first tier
        ({"quantity": 10}, 9_000_000),  # the tier starts AT its threshold
        ({"quantity": 29}, 26_100_000),
        ({"quantity": 30}, 24_000_000),  # the highest reached tier wins
        ({"service": "product", "quantity": 3}, 2_400_000),
        ({"quantity": 4, "addons": ["styling"]}, 4_400_000),  # per item: 4 × 100k
        ({"addons": ["video"]}, 3_000_000),  # fixed: once
        ({"quantity": 4, "addons": ["styling", "video"]}, 6_400_000),
        ({"multipliers": ["urgent"]}, 1_500_000),
        # tier first, then add-ons, then the multiplier: ((10 × 1M) × 0.9 + 10 × 100k + 2M) × 1.5
        ({"quantity": 10, "addons": ["styling", "video"], "multipliers": ["urgent"]}, 18_000_000),
        ({"addons": ["video", "video"]}, 3_000_000),  # choosing an add-on twice counts once
    ],
)
def test_formula_table(choices, expected):
    assert total(**choices) == expected


def test_fractions_round_half_up_to_a_toman():
    rules = [Rule("s", quote.SERVICE, amount=333), Rule("m", quote.MULTIPLIER, factor=Decimal("1.5"))]
    result = quote.estimate(rules, EXACT, service="s", quantity=1, addons=[], multipliers=["m"])
    assert result.total == 500  # 499.5


def test_the_range_is_symmetric_and_rounded_to_the_step():
    limits = Limits(range_percent=15, rounding_step=10_000)
    result = quote.estimate(RULES, limits, service="food", quantity=1, addons=[], multipliers=[])
    assert (result.low, result.high) == (850_000, 1_150_000)
    odd = quote.estimate(RULES, limits, service="food", quantity=3, addons=["styling"], multipliers=[])
    assert odd.low % 10_000 == 0 and odd.high % 10_000 == 0 and odd.low < 3_300_000 < odd.high


@pytest.mark.parametrize("quantity", [0, -1, 201])
def test_quantity_outside_the_limits_is_refused(quantity):
    with pytest.raises(QuoteError) as error:
        quote.estimate(RULES, Limits(), service="food", quantity=quantity, addons=[], multipliers=[])
    assert error.value.code == "bad_quantity"


@pytest.mark.parametrize(
    "choices",
    [
        {"service": "nope"},
        {"service": "styling"},
        {"addons": ["urgent"]},
        {"multipliers": ["video"]},
        {"addons": ["x"]},
    ],
)
def test_unknown_or_wrongly_typed_options_are_refused(choices):
    args = {"service": "food", "quantity": 1, "addons": [], "multipliers": []} | choices
    with pytest.raises(QuoteError) as error:
        quote.estimate(RULES, EXACT, **args)
    assert error.value.code == "unknown_option"


# ---- API -------------------------------------------------------------------------------------------

ESTIMATE = "/api/public/quote/estimate"
OPTIONS = "/api/public/quote/options"
RULES_URL = "/api/admin/pricing/rules/"


def seed():
    QuoteRule.objects.create(key="food", kind="service", label_fa="غذا", label_en="Food", amount=1_000_000, position=0)
    QuoteRule.objects.create(
        key="t10", kind="tier", label_fa="۱۰ به بالا", factor=Decimal("0.9"), min_quantity=10, position=1
    )
    QuoteRule.objects.create(
        key="video", kind="addon_fixed", label_fa="ویدیو", label_en="Video", amount=2_000_000, position=2
    )
    QuoteRule.objects.create(
        key="urgent", kind="multiplier", label_fa="فوری", label_en="Urgent", factor=Decimal("1.5"), position=3
    )
    QuoteRule.objects.create(key="hidden", kind="service", label_fa="غیرفعال", amount=1, is_active=False, position=4)


def test_the_estimate_is_an_approximate_range_without_the_rules(client):
    seed()
    response = client.post(ESTIMATE, {"service": "food", "quantity": 4, "addons": ["video"]}, format="json")
    assert response.status_code == 200
    assert response.json() == {"low": 5_100_000, "high": 6_900_000, "currency": "toman", "approximate": True}
    assert response["Cache-Control"] == "no-store"


def test_options_list_labels_and_limits_but_no_prices(client):
    seed()
    data = client.get(OPTIONS).json()
    assert [s["key"] for s in data["services"]] == ["food"]  # the inactive one is not offered
    assert [a["key"] for a in data["addons"]] == ["video"]
    assert [m["key"] for m in data["multipliers"]] == ["urgent"]
    assert (data["min_quantity"], data["max_quantity"]) == (1, 200)
    body = client.get(OPTIONS).content.decode()
    for secret in ("amount", "factor", "1000000", "2000000", "0.9", "1.5"):
        assert secret not in body


def test_bad_choices_are_400_with_a_code(client):
    seed()
    assert client.post(ESTIMATE, {"service": "nope", "quantity": 1}, format="json").json()["code"] == "unknown_option"
    assert client.post(ESTIMATE, {"service": "hidden", "quantity": 1}, format="json").status_code == 400
    assert client.post(ESTIMATE, {"service": "food", "quantity": 999}, format="json").json()["code"] == "bad_quantity"
    assert client.post(ESTIMATE, {"service": "food"}, format="json").status_code == 400
    assert client.post(ESTIMATE, {"service": "food", "quantity": "x"}, format="json").status_code == 400


def test_estimating_is_rate_limited(client, settings):
    seed()
    from rest_framework.throttling import ScopedRateThrottle

    ScopedRateThrottle.THROTTLE_RATES = {**ScopedRateThrottle.THROTTLE_RATES, "estimate": "3/min"}
    try:
        codes = [client.post(ESTIMATE, {"service": "food", "quantity": 1}, format="json").status_code for _ in range(5)]
    finally:
        ScopedRateThrottle.THROTTLE_RATES = {**ScopedRateThrottle.THROTTLE_RATES, "estimate": "60/min"}
    assert codes[:3] == [200, 200, 200] and codes[3:] == [429, 429]


def test_editing_the_settings_changes_the_range(client, owner_client):
    seed()
    assert (
        owner_client.patch(
            "/api/admin/pricing/quote-settings", {"range_percent": 0, "rounding_step": 1}, format="json"
        ).status_code
        == 200
    )
    body = client.post(ESTIMATE, {"service": "food", "quantity": 2}, format="json").json()
    assert (body["low"], body["high"]) == (2_000_000, 2_000_000)
    assert client.post(ESTIMATE, {"service": "food", "quantity": 201}, format="json").status_code == 400
    owner_client.patch("/api/admin/pricing/quote-settings", {"max_quantity": 500}, format="json")
    assert client.post(ESTIMATE, {"service": "food", "quantity": 201}, format="json").status_code == 200


def test_settings_are_validated(owner_client):
    url = "/api/admin/pricing/quote-settings"
    assert owner_client.patch(url, {"range_percent": 80}, format="json").status_code == 400
    assert owner_client.patch(url, {"rounding_step": 0}, format="json").status_code == 400
    assert owner_client.patch(url, {"min_quantity": 10, "max_quantity": 5}, format="json").status_code == 400
    assert QuoteSettings.load().range_percent == 15


def test_the_owner_api_requires_a_verified_login(client):
    for call in (
        client.get(RULES_URL),
        client.post(RULES_URL, {}, format="json"),
        client.get("/api/admin/pricing/quote-settings"),
    ):
        assert call.status_code == 403
    assert client.post(f"{RULES_URL}preview/", {"service": "food", "quantity": 1}, format="json").status_code == 403


def test_rules_are_validated_per_kind(owner_client):
    base = {"key": "r", "label_fa": "ر"}
    assert owner_client.post(RULES_URL, {**base, "kind": "service"}, format="json").status_code == 400
    assert owner_client.post(RULES_URL, {**base, "kind": "tier", "factor": "0.9"}, format="json").status_code == 400
    assert owner_client.post(RULES_URL, {**base, "kind": "multiplier"}, format="json").status_code == 400
    assert owner_client.post(RULES_URL, {**base, "kind": "multiplier", "factor": "0"}, format="json").status_code == 400
    assert (
        owner_client.post(RULES_URL, {**base, "kind": "multiplier", "factor": "99"}, format="json").status_code == 400
    )
    ok = owner_client.post(
        RULES_URL, {**base, "kind": "service", "amount": 5, "factor": "2", "min_quantity": 3}, format="json"
    )
    assert ok.status_code == 201
    assert ok.json()["factor"] is None and ok.json()["min_quantity"] is None  # not part of this kind
    assert (
        owner_client.post(RULES_URL, {**base, "kind": "service", "amount": 5}, format="json").status_code == 400
    )  # key taken


def test_switching_a_rules_kind_drops_the_old_numbers(owner_client):
    rule = QuoteRule.objects.create(key="x", kind="multiplier", label_fa="ض", factor=Decimal("1.2"))
    response = owner_client.patch(f"{RULES_URL}{rule.pk}/", {"kind": "addon_fixed", "amount": 100}, format="json")
    assert response.status_code == 200
    assert response.json()["factor"] is None and response.json()["amount"] == 100


def test_the_preview_shows_how_the_number_is_built(owner_client):
    seed()
    response = owner_client.post(
        f"{RULES_URL}preview/",
        {"service": "food", "quantity": 10, "addons": ["video"], "multipliers": ["urgent"]},
        format="json",
    )
    body = response.json()
    assert response.status_code == 200
    assert (body["base"], body["tier_factor"], body["total"]) == (10_000_000, "0.900", 16_500_000)
    assert body["addons"] == [["video", "2000000"]] and body["multipliers"] == [["urgent", "1.500"]]


def test_rules_can_be_reordered_and_deleted_and_changes_are_audited(owner_client):
    from apps.audit.models import AuditLog

    seed()
    ids = list(QuoteRule.objects.order_by("position").values_list("pk", flat=True))
    assert owner_client.post(f"{RULES_URL}reorder/", {"ids": ids[::-1]}, format="json").status_code == 204
    assert list(QuoteRule.objects.order_by("position").values_list("pk", flat=True)) == ids[::-1]
    assert owner_client.delete(f"{RULES_URL}{ids[0]}/").status_code == 204
    actions = set(AuditLog.objects.values_list("action", flat=True))
    assert {"pricing.quoterule.reorder", "pricing.quoterule.delete"} <= actions
