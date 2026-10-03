import uuid
from datetime import timedelta

import pytest
from django.core import signing
from django.core.management import call_command
from django.utils import timezone

from apps.audit.models import AuditLog
from apps.blog import cache as blog_cache
from apps.blog.models import Article, ArticleSlugRedirect, Category, Tag
from apps.blog.serializers import PREVIEW_SALT
from apps.media.models import MediaAsset, MediaReference
from apps.media.tests.factories import make_asset
from apps.portfolio.models import Project

pytestmark = pytest.mark.django_db

ARTICLES = "/api/admin/blog/articles/"
LIST = "/api/public/blog/articles"


def doc(*texts: str) -> dict:  # type: ignore[type-arg]
    return {
        "type": "doc",
        "content": [{"type": "paragraph", "content": [{"type": "text", "text": t}]} for t in texts],
    }


def image_doc(asset: MediaAsset) -> dict:  # type: ignore[type-arg]
    return {"type": "doc", "content": [{"type": "image", "attrs": {"mediaId": str(asset.pk)}}]}


def make_article(language: str = "fa", **kwargs):  # type: ignore[no-untyped-def]
    n = Article.objects.count()
    defaults = {
        "language": language,
        "slug": f"a{n}",
        "title": f"عنوان {n}",
        "summary": "خلاصه",
        "body": doc("متن"),
        "status": Article.Status.PUBLISHED,
        "published_at": timezone.now() - timedelta(hours=1),
    }
    article = Article(**{**defaults, **kwargs})
    article.save()
    return article


def slugs(client, **params):  # type: ignore[no-untyped-def]
    return [a["slug"] for a in client.get(LIST, {"lang": "fa", **params}).json()["results"]]


# ---- public: what visitors can see -----------------------------------------------------------------


def test_drafts_and_scheduled_articles_are_never_public(client):
    make_article(slug="live")
    make_article(slug="draft", status=Article.Status.DRAFT, published_at=None)
    make_article(slug="draft-with-date", status=Article.Status.DRAFT)
    make_article(slug="scheduled", published_at=timezone.now() + timedelta(days=1))
    assert slugs(client) == ["live"]
    for hidden in ("draft", "draft-with-date", "scheduled"):
        assert client.get(f"/api/public/blog/articles/fa/{hidden}/").status_code == 404


def test_list_is_scoped_to_the_language_and_newest_first(client):
    make_article("fa", slug="old", published_at=timezone.now() - timedelta(days=3))
    make_article("fa", slug="new", published_at=timezone.now() - timedelta(days=1))
    make_article("en", slug="english-only")
    assert slugs(client) == ["new", "old"]
    assert [a["slug"] for a in client.get(LIST, {"lang": "en"}).json()["results"]] == ["english-only"]


def test_language_is_required_and_validated(client):
    assert client.get(LIST).status_code == 400
    assert client.get(LIST, {"lang": "de"}).status_code == 400
    assert client.get("/api/public/blog/taxonomy").status_code == 400
    assert client.get("/api/public/blog/articles/de/x/").status_code == 400


def test_filters_and_pagination(client):
    food = Category.objects.create(slug="food", title_fa="غذا")
    tip = Tag.objects.create(slug="tips", title_fa="نکته")
    for i in range(11):
        make_article(slug=f"p{i}", published_at=timezone.now() - timedelta(hours=i + 1))
    a = make_article(slug="tagged", category=food)
    a.tags.add(tip)
    page1 = client.get(LIST, {"lang": "fa"}).json()
    assert (page1["count"], page1["page"], page1["pages"], len(page1["results"])) == (12, 1, 2, 9)
    assert len(client.get(LIST, {"lang": "fa", "page": 2}).json()["results"]) == 3
    assert slugs(client, category="food") == ["tagged"]
    assert slugs(client, tag="tips") == ["tagged"]


def test_taxonomy_only_lists_what_exists_in_that_language(client):
    only_en = Category.objects.create(slug="journal", title_fa="مجله", title_en="Journal")
    both = Category.objects.create(slug="food", title_fa="غذا", title_en="Food")
    en_tag = Tag.objects.create(slug="en-tag", title_fa="ان")
    make_article("en", slug="e1", category=only_en)
    make_article("en", slug="e2", category=both)
    make_article("fa", slug="f1", category=both)
    make_article("fa", slug="f-draft", category=only_en, status=Article.Status.DRAFT, published_at=None)
    make_article("en", slug="e3").tags.add(en_tag)

    fa = client.get("/api/public/blog/taxonomy", {"lang": "fa"}).json()
    assert [(c["slug"], c["count"]) for c in fa["categories"]] == [("food", 1)]
    assert fa["tags"] == []
    en = client.get("/api/public/blog/taxonomy", {"lang": "en"}).json()
    assert {(c["slug"], c["count"]) for c in en["categories"]} == {("journal", 1), ("food", 1)}
    assert [t["slug"] for t in en["tags"]] == ["en-tag"]


def test_detail_has_rendered_body_seo_and_only_real_alternates(client):
    asset = make_asset("inline")
    fa = make_article("fa", slug="hello", body=image_doc(asset), summary="خلاصه")
    en = make_article("en", slug="hello-en", translation_group=fa.translation_group)
    draft_group = make_article("fa", slug="other")
    make_article(
        "en", slug="other-en", translation_group=draft_group.translation_group, status="draft", published_at=None
    )

    detail = client.get("/api/public/blog/articles/fa/hello/").json()
    assert "<img" in detail["body_html"] and "/v/inline.webp" in detail["body_html"]
    assert detail["seo_title"] == fa.title and detail["seo_description"] == "خلاصه"
    assert detail["alternates"] == [{"language": "en", "slug": en.slug}]
    # an English version that is still a draft is not advertised
    assert client.get("/api/public/blog/articles/fa/other/").json()["alternates"] == []
    assert "private" not in str(detail).lower()


def test_seo_fields_override_the_defaults(client):
    cover, og = make_asset("cover"), make_asset("og")
    make_article(slug="seo", cover=cover, og_image=og, seo_title="عنوان گوگل", seo_description="توضیح گوگل")
    detail = client.get("/api/public/blog/articles/fa/seo/").json()
    assert detail["seo_title"] == "عنوان گوگل" and detail["seo_description"] == "توضیح گوگل"
    assert detail["og_image"]["id"] == str(og.pk) and detail["cover"]["id"] == str(cover.pk)


def test_og_image_falls_back_to_the_cover(client):
    cover = make_asset("cover")
    make_article(slug="c", cover=cover)
    assert client.get("/api/public/blog/articles/fa/c/").json()["og_image"]["id"] == str(cover.pk)


def test_neighbours_related_articles_and_projects(client):
    food = Category.objects.create(slug="food", title_fa="غذا")
    base = timezone.now() - timedelta(days=10)
    one = make_article(slug="one", category=food, published_at=base)
    two = make_article(slug="two", category=food, published_at=base + timedelta(days=1))
    make_article(slug="three", category=food, published_at=base + timedelta(days=2))
    make_article(slug="unrelated", published_at=base + timedelta(days=3))
    make_article(slug="hidden-draft", category=food, status="draft", published_at=None)
    visible, hidden = (
        Project.objects.create(slug="p", title_fa="پروژه", is_published=True),
        Project.objects.create(slug="q", title_fa="مخفی", is_published=False),
    )
    two.related_projects.set([visible, hidden])

    detail = client.get("/api/public/blog/articles/fa/two/").json()
    assert (detail["previous"], detail["next"]) == ("one", "three")
    assert {a["slug"] for a in detail["related_articles"]} == {"one", "three"}
    assert [p["slug"] for p in detail["related_projects"]] == ["p"]
    assert client.get("/api/public/blog/articles/fa/one/").json()["previous"] is None
    assert one


def test_tag_only_recommendations_do_not_include_every_uncategorised_article(client):
    tip = Tag.objects.create(slug="tips", title_fa="نکته")
    base = timezone.now() - timedelta(days=5)
    current = make_article(slug="current", published_at=base)  # no category, one tag
    current.tags.add(tip)
    sharing = make_article(slug="shares-the-tag", published_at=base + timedelta(days=1))
    sharing.tags.add(tip)
    make_article(slug="unrelated-uncategorised", published_at=base + timedelta(days=2))

    related = client.get("/api/public/blog/articles/fa/current/").json()["related_articles"]
    assert [a["slug"] for a in related] == ["shares-the-tag"]


def test_old_slugs_redirect_permanently_to_the_current_one(client):
    article = make_article(slug="new-name")
    ArticleSlugRedirect.objects.create(article=article, language="fa", old_slug="old-name")
    response = client.get("/api/public/blog/articles/fa/old-name/")
    assert response.status_code == 301
    assert response.json() == {"slug": "new-name"}
    assert response["Location"] == "/api/public/blog/articles/fa/new-name/"
    # redirects are per language
    assert client.get("/api/public/blog/articles/en/old-name/").status_code == 404
    # a redirect to something not (yet) public does not reveal it
    article.status = "draft"
    article.save()
    assert client.get("/api/public/blog/articles/fa/old-name/").status_code == 404


def test_public_endpoints_need_no_login_and_unknown_slugs_are_404(client):
    assert client.get(LIST, {"lang": "fa"}).status_code == 200
    assert client.get("/api/public/blog/articles/fa/nope/").status_code == 404


# ---- scheduled publication and the cache -----------------------------------------------------------


def test_a_scheduled_article_appears_exactly_when_its_time_comes(client, monkeypatch):
    start = timezone.now()
    make_article(slug="later", published_at=start + timedelta(seconds=60))
    make_article(slug="now")
    clock = {"now": start}
    monkeypatch.setattr(timezone, "now", lambda: clock["now"])

    assert slugs(client) == ["now"]  # populates the cache
    assert slugs(client) == ["now"]
    clock["now"] = start + timedelta(seconds=59)
    assert slugs(client) == ["now"]
    clock["now"] = start + timedelta(seconds=61)
    assert slugs(client) == ["later", "now"]  # no waiting for the cache to expire
    assert client.get("/api/public/blog/articles/fa/later/").status_code == 200


def test_cache_entries_never_outlive_the_next_scheduled_publication():
    now = timezone.now()
    assert blog_cache.ttl_until(None, now) == 30
    assert blog_cache.ttl_until(now + timedelta(days=2), now) == 30
    assert blog_cache.ttl_until(now + timedelta(seconds=12, milliseconds=900), now) == 12
    assert blog_cache.ttl_until(now + timedelta(milliseconds=400), now) == 0  # don't cache at all
    assert blog_cache.ttl_until(now - timedelta(seconds=5), now) == 0


def test_a_change_in_the_panel_shows_up_immediately_despite_the_cache(client, owner_client):
    assert slugs(client) == []  # cached empty list
    response = owner_client.post(
        ARTICLES, {"language": "fa", "title": "تازه", "body": doc("سلام"), "status": "published"}, format="json"
    )
    assert response.status_code == 201
    assert slugs(client) == [response.json()["slug"]]
    owner_client.patch(f"{ARTICLES}{response.json()['id']}/", {"status": "draft"}, format="json")
    assert slugs(client) == []


# ---- preview ---------------------------------------------------------------------------------------


def test_preview_link_shows_a_draft_and_is_not_cached(client, owner_client):
    draft = make_article(slug="wip", status="draft", published_at=None, title="در دست نوشتن")
    link = owner_client.post(f"{ARTICLES}{draft.pk}/preview-link/")
    assert link.status_code == 200 and link.json()["expires_in"] == 86400
    response = client.get(f"/api/public/blog/preview/{link.json()['token']}")
    assert response.status_code == 200 and response.json()["title"] == "در دست نوشتن"
    assert response["Cache-Control"] == "no-store"
    assert client.get("/api/public/blog/articles/fa/wip/").status_code == 404


def test_preview_links_expire_and_cannot_be_forged(client, monkeypatch):
    draft = make_article(status="draft", published_at=None)
    token = signing.dumps({"article": draft.pk}, salt=PREVIEW_SALT)
    assert client.get(f"/api/public/blog/preview/{token}").status_code == 200
    monkeypatch.setattr("apps.blog.serializers.PREVIEW_MAX_AGE", -1)
    assert client.get(f"/api/public/blog/preview/{token}").status_code == 404
    forged = signing.dumps({"article": draft.pk}, salt="another-salt")
    monkeypatch.setattr("apps.blog.serializers.PREVIEW_MAX_AGE", 3600)
    assert client.get(f"/api/public/blog/preview/{forged}").status_code == 404
    assert client.get("/api/public/blog/preview/garbage").status_code == 404


# ---- the owner -------------------------------------------------------------------------------------


def create(owner_client, **fields):  # type: ignore[no-untyped-def]
    return owner_client.post(
        ARTICLES, {"language": "fa", "title": "عنوان", "body": doc("متن"), **fields}, format="json"
    )


def test_creating_an_article_makes_a_slug_and_a_reading_time(owner_client):
    response = create(owner_client, title="طعم قهوه", body=doc("کلمه " * 400))
    assert response.status_code == 201, response.content
    body = response.json()
    assert body["slug"] == "طعم-قهوه" and body["status"] == "draft" and body["published_at"] is None
    assert body["reading_minutes"] == 3 and body["is_live"] is False and body["translations"] == []
    assert AuditLog.objects.filter(action="blog.article.create").exists()


def test_slugs_are_unique_per_language_and_duplicates_are_numbered(owner_client):
    first = create(owner_client, title="Same title", language="en").json()
    second = create(owner_client, title="Same title", language="en").json()
    other_language = create(owner_client, title="Same title", language="fa").json()
    assert (first["slug"], second["slug"], other_language["slug"]) == ("same-title", "same-title-2", "same-title")
    clash = create(owner_client, title="x", language="en", slug="same-title")
    assert clash.status_code == 400 and "slug" in clash.json()["fields"]


def test_publishing_without_a_date_uses_now_and_a_future_date_means_scheduled(owner_client):
    live = create(owner_client, status="published").json()
    assert live["is_live"] is True and live["published_at"]
    later = (timezone.now() + timedelta(days=2)).isoformat()
    scheduled = create(owner_client, title="بعدی", status="published", published_at=later).json()
    assert scheduled["is_live"] is False and scheduled["status"] == "published"


def test_a_bad_body_is_refused_with_a_message(owner_client):
    for bad in (
        {"type": "doc", "content": [{"type": "script"}]},
        "<p>html</p>",
        {
            "type": "doc",
            "content": [
                {
                    "type": "paragraph",
                    "content": [
                        {
                            "type": "text",
                            "text": "x",
                            "marks": [{"type": "link", "attrs": {"href": "javascript:alert(1)"}}],
                        }
                    ],
                }
            ],
        },
    ):
        response = create(owner_client, body=bad)
        assert response.status_code == 400 and "body" in response.json()["fields"], bad
    assert Article.objects.count() == 0


def test_images_in_the_body_must_be_ready_library_assets(owner_client):
    missing = {"type": "doc", "content": [{"type": "image", "attrs": {"mediaId": str(uuid.uuid4())}}]}
    assert create(owner_client, body=missing).status_code == 400
    pending = make_asset("pending", MediaAsset.Status.PENDING)
    assert create(owner_client, body=image_doc(pending)).status_code == 400


def test_embedded_images_are_protected_from_deletion_and_released_on_edit(owner_client):
    kept, dropped = make_asset("kept"), make_asset("dropped")
    both = {"type": "doc", "content": [*image_doc(kept)["content"], *image_doc(dropped)["content"]]}
    article = create(owner_client, body=both).json()
    assert kept.references.count() == 1 and dropped.references.count() == 1
    assert owner_client.delete(f"/api/admin/media/{kept.pk}/").status_code == 409

    owner_client.patch(f"{ARTICLES}{article['id']}/", {"body": image_doc(kept)}, format="json")
    assert kept.references.count() == 1 and dropped.references.count() == 0
    assert owner_client.delete(f"/api/admin/media/{dropped.pk}/").status_code == 204

    assert owner_client.delete(f"{ARTICLES}{article['id']}/").status_code == 204
    assert not MediaReference.objects.filter(asset=kept).exists()


def test_cover_and_og_image_are_references_too(owner_client):
    cover = make_asset("cover")
    article = create(owner_client, cover=str(cover.pk)).json()
    assert cover.references.count() == 1
    owner_client.patch(f"{ARTICLES}{article['id']}/", {"cover": None}, format="json")
    assert cover.references.count() == 0


def test_renaming_creates_a_redirect_and_chains_follow_the_article(owner_client, client):
    article = create(owner_client, title="اول", slug="first", status="published").json()
    url = f"{ARTICLES}{article['id']}/"
    assert owner_client.patch(url, {"slug": "second"}, format="json").status_code == 200
    assert owner_client.patch(url, {"slug": "third"}, format="json").status_code == 200
    assert sorted(ArticleSlugRedirect.objects.values_list("old_slug", flat=True)) == ["first", "second"]
    for old in ("first", "second"):  # every old address goes straight to the current one
        response = client.get(f"/api/public/blog/articles/fa/{old}/")
        assert response.status_code == 301 and response.json()["slug"] == "third"
    # going back to an old name removes it from the redirects: the live slug is never a redirect
    owner_client.patch(url, {"slug": "first"}, format="json")
    assert not ArticleSlugRedirect.objects.filter(old_slug="first").exists()
    assert client.get("/api/public/blog/articles/fa/first/").status_code == 200
    assert client.get("/api/public/blog/articles/fa/third/").status_code == 301


def test_a_new_article_can_take_a_slug_that_is_only_someones_old_redirect(owner_client):
    old_owner = make_article(slug="current")
    ArticleSlugRedirect.objects.create(article=old_owner, language="fa", old_slug="taken-later")
    taker = create(owner_client, title="x", slug="taken-later").json()
    article = Article.objects.get(pk=taker["id"])
    owner_client.patch(f"{ARTICLES}{article.pk}/", {"slug": "renamed"}, format="json")
    assert ArticleSlugRedirect.objects.get(old_slug="taken-later").article_id == article.pk


def test_language_cannot_change_after_creation(owner_client):
    article = create(owner_client).json()
    response = owner_client.patch(f"{ARTICLES}{article['id']}/", {"language": "en"}, format="json")
    assert response.status_code == 400


def test_translate_makes_a_linked_draft_once(owner_client):
    category = Category.objects.create(slug="food", title_fa="غذا")
    tag = Tag.objects.create(slug="t", title_fa="ت")
    source = create(owner_client, title="Coffee", category=category.pk, tags=[tag.pk], status="published").json()
    response = owner_client.post(f"{ARTICLES}{source['id']}/translate/")
    assert response.status_code == 201
    copy = response.json()
    assert copy["language"] == "en" and copy["status"] == "draft" and copy["published_at"] is None
    assert copy["translation_group"] == source["translation_group"]
    assert copy["category"] == category.pk and copy["tags"] == [tag.pk]
    assert [t["language"] for t in owner_client.get(f"{ARTICLES}{source['id']}/").json()["translations"]] == ["en"]
    assert owner_client.post(f"{ARTICLES}{source['id']}/translate/").status_code == 409
    assert owner_client.post(f"{ARTICLES}{copy['id']}/translate/").status_code == 409  # fa already exists


def test_list_filters_for_the_owner(owner_client):
    make_article("fa", slug="a", status="draft", published_at=None, title="قهوه")
    make_article("en", slug="b", title="Tea")
    get = lambda q: [a["slug"] for a in owner_client.get(ARTICLES, q).json()]  # noqa: E731
    assert sorted(get({})) == ["a", "b"]
    assert get({"status": "draft"}) == ["a"]
    assert get({"language": "en"}) == ["b"]
    assert get({"q": "قهوه"}) == ["a"]


def test_categories_and_tags(owner_client):
    category = owner_client.post("/api/admin/blog/categories/", {"title_fa": "غذا", "title_en": "Food"}, format="json")
    tag = owner_client.post("/api/admin/blog/tags/", {"title_fa": "نکته", "title_en": "Tip"}, format="json")
    assert category.status_code == 201 and category.json()["slug"] == "food"
    assert tag.status_code == 201 and tag.json()["slug"] == "tip"
    article = create(owner_client, category=category.json()["id"], tags=[tag.json()["id"]]).json()
    assert owner_client.get("/api/admin/blog/categories/").json()[0]["article_count"] == 1
    # deleting a category keeps its articles
    assert owner_client.delete(f"/api/admin/blog/categories/{category.json()['id']}/").status_code == 204
    assert owner_client.get(f"{ARTICLES}{article['id']}/").json()["category"] is None


def test_related_projects_and_tags_are_saved(owner_client):
    project = Project.objects.create(slug="p", title_fa="پروژه", is_published=True)
    tag = Tag.objects.create(slug="t", title_fa="ت")
    article = create(owner_client, related_projects=[project.pk], tags=[tag.pk]).json()
    assert article["related_projects"] == [project.pk] and article["tags"] == [tag.pk]
    owner_client.patch(f"{ARTICLES}{article['id']}/", {"tags": []}, format="json")
    assert owner_client.get(f"{ARTICLES}{article['id']}/").json()["tags"] == []


def test_the_owner_api_requires_a_verified_login(client):
    assert client.get(ARTICLES).status_code == 403
    assert client.post(ARTICLES, {"language": "fa", "title": "x"}, format="json").status_code == 403
    assert client.get("/api/admin/blog/categories/").status_code == 403


def test_a_malformed_body_is_a_400_not_a_500(owner_client):
    body = {"type": "doc", "content": [{"type": "image", "attrs": []}]}
    response = create(owner_client, body=body)
    assert response.status_code == 400 and "body" in response.json()["fields"]


def test_seed_demo_keeps_the_translations_linked_after_a_partial_repair(client):
    call_command("seed_blog_demo")
    Article.objects.get(language="fa", slug="sample-article").delete()
    call_command("seed_blog_demo")  # only the English sample is left: the new Persian one must join its group
    fa, en = (Article.objects.get(language=lang, slug="sample-article") for lang in ("fa", "en"))
    assert fa.translation_group == en.translation_group
    # and records that had already drifted apart are brought back together
    en.translation_group = uuid.uuid4()
    en.save()
    call_command("seed_blog_demo")
    assert Article.objects.get(language="en").translation_group == Article.objects.get(language="fa").translation_group
    assert client.get("/api/public/blog/articles/fa/sample-article/").json()["alternates"]


def test_seed_demo_is_repeatable_and_public(client):
    call_command("seed_blog_demo")
    call_command("seed_blog_demo")
    assert Article.objects.count() == 2
    assert slugs(client) == ["sample-article"]
    fa = client.get("/api/public/blog/articles/fa/sample-article/").json()
    assert fa["alternates"] == [{"language": "en", "slug": "sample-article"}]
