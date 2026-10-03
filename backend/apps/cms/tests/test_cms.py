import pytest
from django.core.management import call_command

from apps.audit.models import AuditLog
from apps.cms.blocks import BLOCKS
from apps.cms.models import ContentBlock, ContentItem, SiteSettings
from apps.cms.service import ensure_blocks
from apps.media.models import MediaAsset
from apps.media.tests.factories import make_asset

pytestmark = pytest.mark.django_db

ITEMS = "/api/admin/cms/items/"


def make_item(collection: str = "service", **kwargs):  # type: ignore[no-untyped-def]
    return ContentItem.objects.create(collection=collection, **{"title_fa": "عنوان", **kwargs})


# ---- public ----------------------------------------------------------------------------------------


def test_public_site_needs_no_login_and_lists_every_block(client):
    response = client.get("/api/public/site")
    assert response.status_code == 200
    body = response.json()
    assert set(body["blocks"]) == {b.key for b in BLOCKS}
    assert body["blocks"]["home.intro_title"]["fa"] == "طعم را دیدنی می‌کنیم"
    assert body["settings"]["brand_name_en"] == "Sevda Rahimpour"
    assert set(body["collections"]) == {c.value for c in ContentItem.Collection}
    assert response["Cache-Control"] == "public, max-age=30"


def test_public_site_hides_unpublished_items_and_orders_the_rest(client):
    make_item(position=2, title_fa="دوم")
    make_item(position=1, title_fa="اول")
    make_item(position=0, title_fa="پنهان", is_published=False)
    titles = [i["title_fa"] for i in client.get("/api/public/site").json()["collections"]["service"]]
    assert titles == ["اول", "دوم"]


def test_public_site_exposes_media_variants_but_no_private_fields(client):
    asset = make_asset()
    make_item("hero_slide", media=asset)
    slide = client.get("/api/public/site").json()["collections"]["hero_slide"][0]
    assert slide["media"]["variants"][0]["name"] == "w480"
    assert set(slide["media"]) == {
        "id",
        "kind",
        "width",
        "height",
        "duration_seconds",
        "alt_fa",
        "alt_en",
        "lqip",
        "variants",
    }
    assert "original" not in str(slide).lower()


def test_ensure_blocks_is_idempotent_and_keeps_edits():
    assert ensure_blocks() == len(BLOCKS)
    ContentBlock.objects.filter(key="about.title").update(text_fa="ویرایش‌شده")
    assert ensure_blocks() == 0
    assert ContentBlock.objects.get(key="about.title").text_fa == "ویرایش‌شده"


def test_seed_command_is_repeatable(capsys):
    call_command("seed_cms")
    call_command("seed_cms")
    assert SiteSettings.objects.count() == 1
    assert ContentBlock.objects.count() == len(BLOCKS)


# ---- settings and blocks ---------------------------------------------------------------------------


def test_owner_updates_settings_and_it_is_audited(owner_client):
    response = owner_client.patch(
        "/api/admin/cms/settings", {"phone": "0914 000 0000", "tagline_en": "New"}, format="json"
    )
    assert response.status_code == 200
    assert SiteSettings.load().phone == "0914 000 0000"
    assert AuditLog.objects.filter(action="cms.settings.update").exists()


def test_settings_logo_must_be_a_ready_asset(owner_client):
    pending = make_asset("p", MediaAsset.Status.PENDING)
    assert owner_client.patch("/api/admin/cms/settings", {"logo": str(pending.pk)}, format="json").status_code == 400
    ready = make_asset("r")
    response = owner_client.patch("/api/admin/cms/settings", {"logo": str(ready.pk)}, format="json")
    assert response.status_code == 200
    assert response.json()["logo_detail"]["variants"][0]["name"] == "w480"


def test_blocks_are_listed_in_registry_order_with_labels(owner_client):
    rows = owner_client.get("/api/admin/cms/blocks/").json()
    assert [r["key"] for r in rows] == [b.key for b in BLOCKS]
    first = rows[0]
    assert first["display_name"] and first["group"] == "home" and first["kind"] == "text"


def test_owner_edits_a_block_text_and_image(owner_client):
    asset = make_asset()
    response = owner_client.patch(
        "/api/admin/cms/blocks/about.photo/", {"media": str(asset.pk), "text_fa": "x"}, format="json"
    )
    assert response.status_code == 200
    assert response.json()["media_detail"]["id"] == str(asset.pk)
    owner_client.patch("/api/admin/cms/blocks/about.title/", {"text_en": "Hello"}, format="json")
    assert ContentBlock.objects.get(key="about.title").text_en == "Hello"
    assert AuditLog.objects.filter(action="cms.block.update", target_id__isnull=False).count() == 2


def test_unknown_block_keys_are_not_found_and_cannot_be_created(owner_client):
    assert owner_client.patch("/api/admin/cms/blocks/nope.nothing/", {"text_fa": "x"}, format="json").status_code == 404
    assert owner_client.post("/api/admin/cms/blocks/", {"key": "evil"}, format="json").status_code == 405


# ---- items -----------------------------------------------------------------------------------------


def test_items_get_consecutive_positions_per_collection(owner_client):
    ids = []
    for title in ("الف", "ب"):
        response = owner_client.post(ITEMS, {"collection": "faq", "title_fa": title}, format="json")
        assert response.status_code == 201, response.content
        ids.append(response.json()["position"])
    other = owner_client.post(ITEMS, {"collection": "client", "title_fa": "ج"}, format="json").json()
    assert ids == [0, 1] and other["position"] == 0
    assert AuditLog.objects.filter(action="cms.item.create").count() == 3


def test_item_needs_some_content_and_a_safe_link(owner_client):
    assert owner_client.post(ITEMS, {"collection": "faq"}, format="json").status_code == 400
    bad = owner_client.post(
        ITEMS, {"collection": "faq", "title_fa": "x", "link_url": "javascript:alert(1)"}, format="json"
    )
    assert bad.status_code == 400 and "link_url" in bad.json()["fields"]
    ok = owner_client.post(ITEMS, {"collection": "faq", "title_fa": "x", "link_url": "/services"}, format="json")
    assert ok.status_code == 201


def test_item_collection_cannot_change_and_filter_works(owner_client):
    item = make_item("faq")
    make_item("client")
    assert owner_client.patch(f"{ITEMS}{item.pk}/", {"collection": "client"}, format="json").status_code == 400
    assert owner_client.patch(f"{ITEMS}{item.pk}/", {"title_en": "Q"}, format="json").status_code == 200
    rows = owner_client.get(ITEMS, {"collection": "faq"}).json()
    assert [r["id"] for r in rows] == [item.pk]


def test_deleting_an_item_is_audited(owner_client):
    item = make_item()
    assert owner_client.delete(f"{ITEMS}{item.pk}/").status_code == 204
    assert not ContentItem.objects.filter(pk=item.pk).exists()
    assert AuditLog.objects.filter(action="cms.item.delete").exists()


def test_reorder_sets_positions_and_rejects_partial_lists(owner_client):
    a, b, c = (make_item("faq", position=i, title_fa=t) for i, t in enumerate("abc"))
    ok = owner_client.post(f"{ITEMS}reorder/", {"collection": "faq", "ids": [c.pk, a.pk, b.pk]}, format="json")
    assert ok.status_code == 204
    assert list(ContentItem.objects.filter(collection="faq").values_list("title_fa", flat=True)) == ["c", "a", "b"]
    bad = owner_client.post(f"{ITEMS}reorder/", {"collection": "faq", "ids": [a.pk]}, format="json")
    assert bad.status_code == 400 and bad.json()["code"] == "bad_order"


# ---- media usage -----------------------------------------------------------------------------------


def test_used_assets_report_usage_and_cannot_be_deleted_until_released(owner_client):
    asset = make_asset()
    item = make_item("hero_slide", media=asset)
    owner_client.patch("/api/admin/cms/blocks/about.photo/", {"media": str(asset.pk)}, format="json")

    listing = owner_client.get("/api/admin/media/").json()["results"]
    assert next(r for r in listing if r["id"] == str(asset.pk))["usage_count"] == 2
    assert owner_client.delete(f"/api/admin/media/{asset.pk}/").status_code == 409

    owner_client.patch(f"{ITEMS}{item.pk}/", {"media": None, "title_fa": "فقط متن"}, format="json")
    owner_client.patch("/api/admin/cms/blocks/about.photo/", {"media": None}, format="json")
    assert owner_client.delete(f"/api/admin/media/{asset.pk}/").status_code == 204


def test_replacing_an_image_moves_the_reference(owner_client):
    first, second = make_asset("one"), make_asset("two")
    owner_client.patch("/api/admin/cms/blocks/about.photo/", {"media": str(first.pk)}, format="json")
    owner_client.patch("/api/admin/cms/blocks/about.photo/", {"media": str(second.pk)}, format="json")
    assert first.references.count() == 0 and second.references.count() == 1


def test_deleting_an_item_releases_its_media(owner_client):
    asset = make_asset()
    item = make_item("hero_slide", media=asset)
    assert asset.references.count() == 1
    owner_client.delete(f"{ITEMS}{item.pk}/")
    assert asset.references.count() == 0


def test_clearing_the_only_content_of_an_item_is_rejected(owner_client):
    item = make_item("hero_slide", title_fa="", media=make_asset())
    assert owner_client.patch(f"{ITEMS}{item.pk}/", {"media": None}, format="json").status_code == 400
    item.refresh_from_db()
    assert item.media_id is not None
    # still fine when some text remains
    assert (
        owner_client.patch(f"{ITEMS}{item.pk}/", {"media": None, "title_fa": "متن"}, format="json").status_code == 200
    )
