import pytest

from apps.pricing.models import Package, PackageFeature, PackageGroup

pytestmark = pytest.mark.django_db

GROUPS = "/api/admin/pricing/groups/"
PACKAGES = "/api/admin/pricing/packages/"


def make_package(group: PackageGroup, **kwargs):  # type: ignore[no-untyped-def]
    return Package.objects.create(group=group, **{"title_fa": "پکیج", **kwargs})


def test_public_packages_only_show_published_packages_in_published_groups(client):
    shop = PackageGroup.objects.create(title_fa="فروشگاهی")
    empty = PackageGroup.objects.create(title_fa="خالی")
    hidden = PackageGroup.objects.create(title_fa="پنهان", is_published=False)
    live = make_package(shop, title_fa="زنده", position=1)
    make_package(shop, title_fa="پیش‌نویس", is_published=False)
    make_package(hidden, title_fa="در گروه پنهان")
    PackageFeature.objects.create(package=live, text_fa="دوم", position=1)
    PackageFeature.objects.create(package=live, text_fa="اول", position=0)

    groups = client.get("/api/public/packages").json()["groups"]
    assert [g["title_fa"] for g in groups] == ["فروشگاهی"]
    assert [p["title_fa"] for p in groups[0]["packages"]] == ["زنده"]
    assert [f["text_fa"] for f in groups[0]["packages"][0]["features"]] == ["اول", "دوم"]
    assert empty.pk


def test_price_modes_are_validated(owner_client):
    group = PackageGroup.objects.create(title_fa="منو")
    base = {"group": group.pk, "title_fa": "پایه"}
    assert owner_client.post(PACKAGES, {**base, "price_mode": "from"}, format="json").status_code == 400
    assert (
        owner_client.post(PACKAGES, {**base, "price_mode": "fixed", "price_amount": 0}, format="json").status_code
        == 400
    )
    ok = owner_client.post(PACKAGES, {**base, "price_mode": "from", "price_amount": 250000}, format="json")
    assert ok.status_code == 201 and ok.json()["price_amount"] == 250000
    inquiry = owner_client.post(PACKAGES, {**base, "price_mode": "inquiry", "price_amount": 999}, format="json")
    assert inquiry.json()["price_amount"] is None  # an inquiry never shows a number


def test_switching_a_package_to_inquiry_clears_its_amount(owner_client):
    group = PackageGroup.objects.create(title_fa="منو")
    package = make_package(group, price_mode="fixed", price_amount=100)
    response = owner_client.patch(f"{PACKAGES}{package.pk}/", {"price_mode": "inquiry"}, format="json")
    assert response.status_code == 200 and response.json()["price_amount"] is None
    back = owner_client.patch(f"{PACKAGES}{package.pk}/", {"price_mode": "fixed"}, format="json")
    assert back.status_code == 400  # a fixed price needs an amount again


def test_features_are_replaced_as_a_list_and_kept_when_omitted(owner_client):
    group = PackageGroup.objects.create(title_fa="منو")
    created = owner_client.post(
        PACKAGES,
        {"group": group.pk, "title_fa": "الف", "features": [{"text_fa": "یک"}, {"text_fa": "دو", "text_en": "two"}]},
        format="json",
    ).json()
    assert [f["text_fa"] for f in created["features"]] == ["یک", "دو"]
    url = f"{PACKAGES}{created['id']}/"
    assert len(owner_client.patch(url, {"title_en": "A"}, format="json").json()["features"]) == 2
    assert [
        f["text_fa"]
        for f in owner_client.patch(url, {"features": [{"text_fa": "سه"}]}, format="json").json()["features"]
    ] == ["سه"]


def test_group_with_packages_cannot_be_deleted_and_counts_them(owner_client):
    group = PackageGroup.objects.create(title_fa="منو")
    package = make_package(group)
    assert owner_client.get(GROUPS).json()[0]["package_count"] == 1
    assert owner_client.delete(f"{GROUPS}{group.pk}/").status_code == 409
    assert owner_client.delete(f"{PACKAGES}{package.pk}/").status_code == 204
    assert owner_client.delete(f"{GROUPS}{group.pk}/").status_code == 204


def test_packages_filter_by_group_and_reorder(owner_client):
    g1, g2 = PackageGroup.objects.create(title_fa="الف"), PackageGroup.objects.create(title_fa="ب")
    a, b = make_package(g1, title_fa="a"), make_package(g2, title_fa="b")
    assert [p["title_fa"] for p in owner_client.get(PACKAGES, {"group": g2.pk}).json()] == ["b"]
    assert owner_client.post(f"{PACKAGES}reorder/", {"ids": [b.pk, a.pk]}, format="json").status_code == 204
    assert [p["title_fa"] for p in owner_client.get(PACKAGES).json()] == ["b", "a"]


def test_features_keep_their_included_state(client, owner_client):
    group = PackageGroup.objects.create(title_fa="منو")
    created = owner_client.post(
        PACKAGES,
        {
            "group": group.pk,
            "title_fa": "الف",
            "features": [
                {"text_fa": "ریتاچ", "included": True},
                {"text_fa": "ویدیو", "included": False},
                {"text_fa": "پیش‌فرض"},
            ],
        },
        format="json",
    ).json()
    assert [f["included"] for f in created["features"]] == [True, False, True]
    public = client.get("/api/public/packages").json()["groups"][0]["packages"][0]["features"]
    assert [(f["text_fa"], f["included"]) for f in public] == [("ریتاچ", True), ("ویدیو", False), ("پیش‌فرض", True)]
