import pytest

from apps.audit.models import AuditLog
from apps.media.models import MediaAsset
from apps.media.tests.factories import make_asset
from apps.portfolio.models import Category, Project, ProjectImage

pytestmark = pytest.mark.django_db

CATEGORIES = "/api/admin/portfolio/categories/"
PROJECTS = "/api/admin/portfolio/projects/"


def make_project(**kwargs):  # type: ignore[no-untyped-def]
    return Project.objects.create(**{"slug": "p1", "title_fa": "پروژه", "is_published": True, **kwargs})


# ---- public ----------------------------------------------------------------------------------------


def test_public_portfolio_lists_only_published_work(client):
    cat = Category.objects.create(slug="menu", title_fa="منو")
    hidden_cat = Category.objects.create(slug="old", title_fa="قدیمی", is_published=False)
    make_project(slug="a", category=cat)
    make_project(slug="draft", is_published=False)
    make_project(slug="in-hidden-category", category=hidden_cat)

    body = client.get("/api/public/portfolio").json()
    assert [p["slug"] for p in body["projects"]] == ["a"]
    assert [c["slug"] for c in body["categories"]] == ["menu"]
    assert body["categories"][0]["project_count"] == 1


def test_public_portfolio_filters(client):
    menu = Category.objects.create(slug="menu", title_fa="منو")
    make_project(slug="a", category=menu, style="low_key", is_featured=True)
    make_project(slug="b", style="high_key")
    get = lambda q: [p["slug"] for p in client.get("/api/public/portfolio", q).json()["projects"]]  # noqa: E731
    assert get({"category": "menu"}) == ["a"]
    assert get({"style": "high_key"}) == ["b"]
    assert get({"featured": "1"}) == ["a"]


def test_cover_falls_back_to_the_first_image(client):
    project = make_project()
    ProjectImage.objects.create(project=project, media=make_asset("first"), position=0)
    ProjectImage.objects.create(project=project, media=make_asset("second"), position=1)
    card = client.get("/api/public/portfolio").json()["projects"][0]
    assert card["cover"]["variants"][0]["name"] == "w480"
    project.cover = make_asset("chosen")
    project.save()
    chosen = client.get("/api/public/portfolio").json()["projects"][0]["cover"]
    assert chosen["id"] == str(project.cover_id)


def test_project_detail_has_images_in_order_and_neighbours(client):
    first, middle, last = (make_project(slug=s, position=i) for i, s in enumerate(("one", "two", "three")))
    ProjectImage.objects.create(project=middle, media=make_asset("b"), position=1, caption_fa="دوم")
    ProjectImage.objects.create(project=middle, media=make_asset("a"), position=0, caption_fa="اول")
    detail = client.get("/api/public/portfolio/two").json()
    assert [i["caption_fa"] for i in detail["images"]] == ["اول", "دوم"]
    assert detail["previous"] == "one" and detail["next"] == "three"
    assert client.get("/api/public/portfolio/one").json()["previous"] is None
    assert client.get("/api/public/portfolio/three").json()["next"] is None
    assert first and last


def test_unpublished_project_is_not_found_and_leaks_nothing(client):
    make_project(slug="secret", is_published=False, title_fa="محرمانه")
    response = client.get("/api/public/portfolio/secret")
    assert response.status_code == 404
    assert "محرمانه" not in client.get("/api/public/portfolio").content.decode()


# ---- owner -----------------------------------------------------------------------------------------


def test_category_slug_is_made_from_the_english_title_and_stays_unique(owner_client):
    one = owner_client.post(CATEGORIES, {"title_fa": "منو", "title_en": "Menu Shoots"}, format="json").json()
    two = owner_client.post(CATEGORIES, {"title_fa": "منو دو", "title_en": "Menu Shoots"}, format="json").json()
    assert one["slug"] == "menu-shoots" and two["slug"] == "menu-shoots-2"
    assert (one["position"], two["position"]) == (0, 1)
    plain = owner_client.post(CATEGORIES, {"title_fa": "بدون انگلیسی"}, format="json").json()
    assert plain["slug"] == "category"


def test_a_slug_can_be_chosen_and_must_be_ascii(owner_client):
    assert (
        owner_client.post(CATEGORIES, {"title_fa": "الف", "slug": "my-slug"}, format="json").json()["slug"] == "my-slug"
    )
    assert owner_client.post(CATEGORIES, {"title_fa": "ب", "slug": "فارسی"}, format="json").status_code == 400


def test_project_with_images_is_created_and_replaced(owner_client):
    a, b, c = (make_asset(n) for n in "abc")
    payload = {
        "title_fa": "کمپین", "title_en": "Campaign", "cover": str(a.pk),
        "images": [{"media": str(b.pk), "caption_fa": "اول"}, {"media": str(c.pk)}],
    }  # fmt: skip
    response = owner_client.post(PROJECTS, payload, format="json")
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["slug"] == "campaign" and [i["caption_fa"] for i in body["images"]] == ["اول", ""]
    assert b.references.count() == 1 and a.references.count() == 1

    updated = owner_client.patch(f"{PROJECTS}{body['id']}/", {"images": [{"media": str(c.pk)}]}, format="json")
    assert updated.status_code == 200 and len(updated.json()["images"]) == 1
    assert b.references.count() == 0 and c.references.count() == 1  # released and kept correctly


def test_patch_without_images_keeps_them(owner_client):
    project = make_project()
    ProjectImage.objects.create(project=project, media=make_asset("x"))
    assert owner_client.patch(f"{PROJECTS}{project.pk}/", {"title_en": "T"}, format="json").status_code == 200
    assert project.images.count() == 1


def test_images_must_be_ready_assets(owner_client):
    pending = make_asset("p", MediaAsset.Status.PENDING)
    response = owner_client.post(PROJECTS, {"title_fa": "x", "images": [{"media": str(pending.pk)}]}, format="json")
    assert response.status_code == 400
    assert (
        owner_client.post(
            PROJECTS, {"title_fa": "x", "images": [{"caption_fa": "no media"}]}, format="json"
        ).status_code
        == 400
    )


def test_deleting_a_project_releases_its_images(owner_client):
    project = make_project()
    asset = make_asset("x")
    ProjectImage.objects.create(project=project, media=asset)
    project.save()
    assert asset.references.count() == 1
    assert owner_client.delete(f"{PROJECTS}{project.pk}/").status_code == 204
    assert asset.references.count() == 0
    assert AuditLog.objects.filter(action="portfolio.project.delete").exists()


def test_category_with_projects_cannot_be_deleted(owner_client):
    cat = Category.objects.create(slug="menu", title_fa="منو")
    make_project(category=cat)
    response = owner_client.delete(f"{CATEGORIES}{cat.pk}/")
    assert response.status_code == 409 and response.json()["code"] == "in_use"
    Project.objects.all().delete()
    assert owner_client.delete(f"{CATEGORIES}{cat.pk}/").status_code == 204


def test_reorder_projects_and_reject_partial_lists(owner_client):
    a, b, c = (make_project(slug=s, position=i) for i, s in enumerate("abc"))
    assert owner_client.post(f"{PROJECTS}reorder/", {"ids": [c.pk, a.pk, b.pk]}, format="json").status_code == 204
    assert list(Project.objects.values_list("slug", flat=True)) == ["c", "a", "b"]
    for bad in ({"ids": [a.pk]}, {"ids": [a.pk, a.pk, b.pk]}, {"ids": "x"}, {}):
        assert owner_client.post(f"{PROJECTS}reorder/", bad, format="json").status_code == 400


def test_project_list_filters_and_audit(owner_client):
    cat = Category.objects.create(slug="menu", title_fa="منو")
    make_project(slug="a", category=cat, title_fa="کافه")
    make_project(slug="b", title_fa="رستوران")
    assert [p["slug"] for p in owner_client.get(PROJECTS, {"category": cat.pk}).json()] == ["a"]
    assert [p["slug"] for p in owner_client.get(PROJECTS, {"q": "رستوران"}).json()] == ["b"]
    owner_client.patch(f"{PROJECTS}{Project.objects.get(slug='a').pk}/", {"year": 1404}, format="json")
    assert AuditLog.objects.filter(action="portfolio.project.update").exists()


def test_featured_filter_honours_false(client):
    make_project(slug="star", is_featured=True)
    make_project(slug="plain", is_featured=False)
    get = lambda v: sorted(p["slug"] for p in client.get("/api/public/portfolio", {"featured": v}).json()["projects"])  # noqa: E731
    assert get("true") == ["star"] and get("1") == ["star"]
    assert get("false") == ["plain"] and get("0") == ["plain"]
    assert get("") == ["plain", "star"]


def test_project_detail_loads_only_its_own_gallery(client, django_assert_max_num_queries):
    for i in range(6):
        project = make_project(slug=f"p{i}", position=i)
        ProjectImage.objects.create(project=project, media=make_asset(f"img{i}"), position=0)
    with django_assert_max_num_queries(7):  # constant, not proportional to the number of projects
        assert client.get("/api/public/portfolio/p3").status_code == 200
