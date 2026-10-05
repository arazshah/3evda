import io

import pytest
from PIL import Image

from apps.audit.models import AuditLog
from apps.blog.models import Article
from apps.cms.models import ContentBlock, ContentItem, SiteSettings
from apps.galleries.models import Gallery
from apps.inquiries.models import Inquiry
from apps.media.models import MediaAsset
from apps.portfolio.models import Category, Project
from apps.samplecontent import service
from apps.samplecontent.models import SampleRecord, SampleState

pytestmark = [pytest.mark.django_db, pytest.mark.usefixtures("s3_buckets")]

URL = "/api/admin/sample-content/"


@pytest.fixture(autouse=True)
def _small_pictures(monkeypatch):
    """Real pictures are slow to encode; the logic under test does not care how big they are."""

    def tiny(seed: int, width: int, height: int) -> bytes:
        out = io.BytesIO()
        Image.new("RGB", (60, 40), (seed % 256, (seed * 7) % 256, (seed * 13) % 256)).save(out, "JPEG")
        return out.getvalue()

    monkeypatch.setattr(service, "make_image", tiny)


def load(owner_client):
    assert owner_client.post(URL + "load/", {"confirm": True}, format="json").status_code == 202


def test_only_the_signed_in_owner(client):
    assert client.get(URL).status_code in (401, 403)
    assert client.post(URL + "load/", {"confirm": True}, format="json").status_code in (401, 403)
    assert client.post(URL + "unload/", {"confirm": True}, format="json").status_code in (401, 403)


def test_nothing_runs_without_confirmation(owner_client):
    assert owner_client.post(URL + "load/", {"confirm": False}, format="json").status_code == 400
    assert owner_client.post(URL + "load/", {}, format="json").status_code == 400
    assert owner_client.get(URL).json()["status"] == "empty"


def test_loading_fills_the_whole_site(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    load(owner_client)
    body = owner_client.get(URL).json()
    assert body["status"] == "loaded"
    counts = body["counts"]
    assert counts["project"] == 6 and counts["category"] == 3 and counts["article"] == 6
    assert counts["hero_slide"] == 3 and counts["service"] == 4 and counts["faq"] == 5
    assert counts["package"] == 5 and counts["gallery"] == 1 and counts["inquiry"] == 4

    assert Project.objects.filter(is_published=True).count() == 6
    assert all(p.images.count() >= 6 for p in Project.objects.all())
    assert Article.objects.visible().filter(language="fa").count() == 3
    assert Article.objects.visible().filter(language="en").count() == 3
    gallery = Gallery.objects.get()
    assert gallery.status == "published" and gallery.photos.filter(status="ready").count() == 12
    assert not MediaAsset.objects.exclude(status="ready").exists()
    assert ContentBlock.objects.get(key="about.photo").media_id
    assert SiteSettings.load().phone and SiteSettings.load().og_image_id
    # What visitors see.
    assert len(owner_client.get("/api/public/portfolio").json()["projects"]) == 6
    assert AuditLog.objects.filter(action="sample.load").exists()


def test_a_second_load_is_refused(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    load(owner_client)
    again = owner_client.post(URL + "load/", {"confirm": True}, format="json")
    assert again.status_code == 409 and again.json()["code"] == "already_loaded"


def test_the_owners_own_text_is_never_overwritten(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    site = SiteSettings.load()
    site.phone = "09120000000"
    site.save()
    load(owner_client)
    assert SiteSettings.load().phone == "09120000000"
    assert not SampleRecord.objects.filter(kind="field", field="phone").exists()
    assert SampleRecord.objects.filter(kind="field", field="email").exists()


def test_unloading_removes_exactly_the_sample(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    mine = Category.objects.create(slug="mine", title_fa="من")
    real = Project.objects.create(slug="real", title_fa="واقعی", category=mine, is_published=True)
    real_item = ContentItem.objects.create(collection="faq", title_fa="پرسش من")
    load(owner_client)
    assert owner_client.post(URL + "unload/", {"confirm": True}, format="json").status_code == 202
    body = owner_client.get(URL).json()
    assert body["status"] == "empty" and body["counts"] == {}
    assert list(Project.objects.all()) == [real]
    assert list(Category.objects.all()) == [mine]
    assert list(ContentItem.objects.all()) == [real_item]
    assert not Article.objects.exists() and not Gallery.objects.exists() and not Inquiry.objects.exists()
    assert not MediaAsset.objects.exists() and not SampleRecord.objects.exists()
    assert SiteSettings.load().phone == "" and SiteSettings.load().og_image_id is None
    assert not ContentBlock.objects.filter(media__isnull=False).exists()
    assert AuditLog.objects.filter(action="sample.unload").exists()
    # And it can be loaded again.
    load(owner_client)
    assert owner_client.get(URL).json()["status"] == "loaded"


def test_media_the_owner_started_using_stays(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    load(owner_client)
    asset = Project.objects.get(slug="sample-night-burger").cover
    ContentItem.objects.create(collection="behind_scenes", title_fa="من", media=asset)
    owner_client.post(URL + "unload/", {"confirm": True}, format="json")
    body = owner_client.get(URL).json()
    assert body["status"] == "empty" and body["result"]["kept"] >= 1 and "ماند" in body["message"]
    assert MediaAsset.objects.filter(pk=asset.pk).exists()


def test_a_name_clash_stops_the_load_and_leaves_things_alone(owner_client, settings):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    Category.objects.create(slug="sample-restaurant", title_fa="من")
    load(owner_client)
    body = owner_client.get(URL).json()
    assert body["status"] == "empty" and "از قبل" in body["message"]
    assert Project.objects.count() == 0


def test_a_failed_load_can_be_cleaned_up(owner_client, settings, monkeypatch):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = False

    def boom(*args, **kwargs):
        raise RuntimeError("store down")

    monkeypatch.setattr(service._Loader, "gallery", boom)
    load(owner_client)
    body = owner_client.get(URL).json()
    assert body["status"] == "failed" and Project.objects.exists()
    assert owner_client.post(URL + "unload/", {"confirm": True}, format="json").status_code == 202
    assert owner_client.get(URL).json()["status"] == "empty"
    assert not Project.objects.exists() and not MediaAsset.objects.exists()


def test_a_dead_run_is_reported_as_failed(owner_client):
    from datetime import timedelta

    from django.utils import timezone

    state = SampleState.load()
    state.status = "loading"
    state.started_at = timezone.now() - timedelta(hours=1)
    state.save()
    assert owner_client.get(URL).json()["status"] == "failed"


def test_two_clicks_start_one_run(owner_client, monkeypatch):
    monkeypatch.setattr("apps.samplecontent.views.load_sample_content.delay", lambda *a, **k: None)
    first = owner_client.post(URL + "load/", {"confirm": True}, format="json")
    second = owner_client.post(URL + "load/", {"confirm": True}, format="json")
    assert first.status_code == 202 and second.status_code == 409 and second.json()["code"] == "busy"


def test_unloading_nothing_is_refused(owner_client):
    r = owner_client.post(URL + "unload/", {"confirm": True}, format="json")
    assert r.status_code == 409 and r.json()["code"] == "nothing_to_unload"


def test_a_task_that_lost_its_lease_stops_and_writes_nothing(owner_client):
    import uuid

    state = service.begin(SampleState.Status.LOADING, (SampleState.Status.EMPTY,))
    stale = state.run_id
    state.status = "failed"
    state.run_id = uuid.uuid4()  # declared dead, so the lease moved on
    state.save()
    assert service.run_load(None, stale) == {}
    assert not SampleRecord.objects.exists() and not Project.objects.exists()
    assert SampleState.load().status == "failed"


def test_filling_a_field_writes_only_that_column(owner_client):
    stale = SiteSettings.load()  # what the loader holds while it draws pictures
    SiteSettings.objects.filter(pk=stale.pk).update(address_fa="نشانی تازه‌ی مالک")  # the owner edits meanwhile
    service._Loader(None).fill(stale, "phone", "021")
    fresh = SiteSettings.load()
    assert fresh.phone == "021" and fresh.address_fa == "نشانی تازه‌ی مالک"
    # and a column the owner filled in the meantime is not touched at all
    SiteSettings.objects.filter(pk=stale.pk).update(email="mine@example.com")
    service._Loader(None).fill(stale, "email", "x@example.com")
    assert SiteSettings.load().email == "mine@example.com"


def test_a_lost_lease_takes_the_new_thing_away_again(owner_client):
    import uuid

    SampleState.load()
    loader = service._Loader(None, uuid.uuid4())  # this lease is not the current one
    with pytest.raises(service.Superseded):
        loader.image(1, (60, 40), "late")
    assert not MediaAsset.objects.exists() and not SampleRecord.objects.exists()


def test_a_picture_that_failed_to_process_fails_the_load(owner_client, settings, monkeypatch):
    settings.CELERY_TASK_ALWAYS_EAGER = True
    settings.CELERY_TASK_EAGER_PROPAGATES = False

    def fail(asset_id):
        MediaAsset.objects.filter(pk=asset_id).update(status="failed")
        return "failed"

    monkeypatch.setattr(service, "process_asset", fail)
    load(owner_client)
    body = owner_client.get(URL).json()
    assert body["status"] == "failed" and "ناموفق" in body["message"]
