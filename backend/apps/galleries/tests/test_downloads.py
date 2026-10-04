import io
import zipfile
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from rest_framework.test import APIClient

from apps.galleries import service
from apps.galleries.models import DownloadLog, FinalFile, Gallery, GalleryPhoto, Selection, ZipJob
from apps.galleries.tasks import build_zip, cleanup_zips
from apps.media.tests.factories import image_bytes

from .test_client import authed, make_gallery, put, url

pytestmark = pytest.mark.django_db
ADMIN = "/api/admin/galleries/"


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


def choose(client, gallery, photos, headers, *indexes):
    for i in indexes:
        assert put(client, gallery, photos[i], headers, selected=True).status_code == 200


def zip_names(s3, settings, key):
    body = s3.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key)["Body"].read()
    return sorted(zipfile.ZipFile(io.BytesIO(body)).namelist()), body


# ---- one photo --------------------------------------------------------------------------------------


def test_level_none_gives_nothing(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="none")
    h = authed(client, gallery)
    r = client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h)
    assert r.status_code == 403 and r.data["code"] == "download_disabled"
    assert client.post(url(gallery, "/zip"), **h).status_code == 403
    assert DownloadLog.objects.count() == 0


def test_selected_level_gives_the_display_size_of_chosen_photos_only(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="selected")
    h = authed(client, gallery)
    choose(client, gallery, photos, h, 0)
    refused = client.get(url(gallery, f"/photos/{photos[1].pk}/download"), **h)
    assert refused.status_code == 404  # not chosen
    r = client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h)
    assert r.status_code == 200 and r["Cache-Control"] == "no-store"
    assert r.data["filename"] == "IMG_0.webp"
    assert "/previews/" in r.data["url"] and "/originals/" not in r.data["url"]
    assert "attachment" in r.data["url"] and "X-Amz-Expires=60" in r.data["url"]
    assert DownloadLog.objects.filter(kind="photo", originals=False).count() == 1


def test_original_levels_give_the_original(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="all_original")
    h = authed(client, gallery)
    r = client.get(url(gallery, f"/photos/{photos[2].pk}/download"), **h)  # not chosen, but «all»
    assert r.status_code == 200 and r.data["filename"] == "IMG_2.jpg" and "/originals/" in r.data["url"]
    assert DownloadLog.objects.get().originals is True


def test_selected_original_is_only_for_the_chosen(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="selected_original")
    h = authed(client, gallery)
    assert client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h).status_code == 404
    choose(client, gallery, photos, h, 0)
    assert "/originals/" in client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h).data["url"]


def test_a_level_change_takes_effect_at_once(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="all_web")
    h = authed(client, gallery)
    assert client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h).status_code == 200
    Gallery.objects.filter(pk=gallery.pk).update(download_level="none")
    assert client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h).status_code == 403


def test_download_needs_the_token_and_the_right_gallery(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="all_web", count=1)
    assert client.get(url(gallery, f"/photos/{photos[0].pk}/download")).status_code == 401
    other, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    h = authed(client, other)
    assert client.get(url(other, f"/photos/{photos[0].pk}/download"), **h).status_code == 404


def test_a_download_link_is_signed_and_lasts_sixty_seconds(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="all_original", count=1)
    h = authed(client, gallery)
    link = client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h).data["url"]
    assert link.startswith("/storage-signed/") and "X-Amz-Signature" in link and "X-Amz-Expires=60" in link


# ---- ZIP --------------------------------------------------------------------------------------------


def test_zip_of_the_chosen_photos(client, s3_buckets, settings):
    gallery, photos = make_gallery(s3_buckets, download_level="selected_original", count=4)
    h = authed(client, gallery)
    choose(client, gallery, photos, h, 0, 2)
    started = client.post(url(gallery, "/zip"), **h)
    assert started.status_code == 202
    status = client.get(url(gallery, f"/zip/{started.data['id']}"), **h).data
    assert status["status"] == "ready" and status["done"] == status["total"] == 2  # eager: already built
    assert status["url"].startswith("/storage-signed/") and ".zip" in status["url"]
    job = ZipJob.objects.get()
    names, body = zip_names(s3_buckets, settings, job.key)
    assert names == ["IMG_0.jpg", "IMG_2.jpg"]
    original = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=photos[0].original_key)["Body"].read()
    assert zipfile.ZipFile(io.BytesIO(body)).read("IMG_0.jpg") == original  # byte for byte
    assert job.expires_at - timezone.now() > timedelta(hours=23)
    assert DownloadLog.objects.filter(kind="zip", files=2, originals=True).count() == 1


def test_zip_of_everything_at_display_size_has_no_duplicate_names(client, s3_buckets, settings):
    gallery = Gallery.objects.create(title="g", status="published", download_level="all_web")
    for color in ["#112233", "#223344", "#334455"]:
        service.add_photo(
            gallery, SimpleUploadedFile("same.jpg", image_bytes(color=color, size=(900, 600)), "image/jpeg")
        )
    h = authed(client, gallery)
    job = client.post(url(gallery, "/zip"), **h).data
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).data["status"] == "ready"
    names, _ = zip_names(s3_buckets, settings, ZipJob.objects.get().key)
    assert names == ["same (2).webp", "same (3).webp", "same.webp"]


def test_a_second_request_gets_the_zip_being_made(client, s3_buckets, monkeypatch):
    monkeypatch.setattr("apps.galleries.tasks.build_zip.apply_async", lambda *a, **k: None)  # stays queued
    gallery, _ = make_gallery(s3_buckets, download_level="all_web")
    h = authed(client, gallery)
    first = client.post(url(gallery, "/zip"), **h)
    second = client.post(url(gallery, "/zip"), **h)
    assert first.data["id"] == second.data["id"] and ZipJob.objects.count() == 1
    status = client.get(url(gallery, f"/zip/{first.data['id']}"), **h).data
    assert status["status"] == "queued" and status["url"] is None


def test_zip_with_nothing_to_give_is_refused(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, download_level="selected")
    h = authed(client, gallery)
    r = client.post(url(gallery, "/zip"), **h)
    assert r.status_code == 409 and r.data["code"] == "nothing_to_download"


def test_progress_is_reported_while_building(client, s3_buckets, monkeypatch):
    monkeypatch.setattr("apps.galleries.tasks.build_zip.apply_async", lambda *a, **k: None)
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=3)
    h = authed(client, gallery)
    job = client.post(url(gallery, "/zip"), **h).data
    ZipJob.objects.filter(pk=job["id"]).update(status="running", done=2)
    status = client.get(url(gallery, f"/zip/{job['id']}"), **h).data
    assert (status["status"], status["done"], status["total"], status["url"]) == ("running", 2, 3, None)


def test_a_failed_zip_says_so_and_can_be_asked_again(client, s3_buckets, monkeypatch):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=2)
    h = authed(client, gallery)

    class Broken:
        def open(self, key):
            raise ConnectionError("down")

    monkeypatch.setattr("apps.galleries.tasks.private_storage", lambda: Broken())
    job = client.post(url(gallery, "/zip"), **h).data
    status = client.get(url(gallery, f"/zip/{job['id']}"), **h).data
    assert status["status"] == "failed" and status["url"] is None
    monkeypatch.undo()
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())
    again = client.post(url(gallery, "/zip"), **h)
    assert again.status_code == 202 and again.data["id"] != job["id"]


def test_zip_link_follows_the_level_and_expiry(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    h = authed(client, gallery)
    job = client.post(url(gallery, "/zip"), **h).data
    Gallery.objects.filter(pk=gallery.pk).update(download_level="none")
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).status_code == 403
    Gallery.objects.filter(pk=gallery.pk).update(download_level="all_web")
    ZipJob.objects.filter(pk=job["id"]).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).status_code == 410


def test_a_zip_of_another_gallery_is_not_found(client, s3_buckets):
    first, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    second, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    job = client.post(url(first, "/zip"), **authed(client, first)).data
    assert client.get(url(second, f"/zip/{job['id']}"), **authed(client, second)).status_code == 404


def test_a_zip_built_for_a_deleted_gallery_is_removed(s3_buckets, settings, monkeypatch):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    monkeypatch.setattr("apps.galleries.tasks.build_zip.apply_async", lambda *a, **k: None)
    job = service.start_zip(gallery)
    real = service.file_name

    def delete_midway(photo, originals):
        Gallery.objects.filter(pk=gallery.pk).delete()
        return real(photo, originals)

    monkeypatch.setattr(service, "file_name", delete_midway)
    assert build_zip.run(job.pk) == "gone"
    left = s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("Contents", [])
    assert not [o for o in left if "/zips/" in o["Key"]]


# ---- cleanup ----------------------------------------------------------------------------------------


def test_cleanup_removes_expired_zips_and_files_and_gives_up_on_stuck_jobs(client, s3_buckets, settings):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    h = authed(client, gallery)
    fresh = client.post(url(gallery, "/zip"), **h).data
    old = ZipJob.objects.get(pk=fresh["id"])
    assert old.key
    stuck = ZipJob.objects.create(gallery=gallery, status="running", total=1)
    ZipJob.objects.filter(pk=stuck.pk).update(created_at=timezone.now() - timedelta(hours=3))
    keep = ZipJob.objects.create(
        gallery=gallery, status="ready", key="galleries/x/zips/keep.zip", expires_at=timezone.now() + timedelta(hours=5)
    )
    ZipJob.objects.filter(pk=old.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert cleanup_zips() == 1
    assert not ZipJob.objects.filter(pk=old.pk).exists() and ZipJob.objects.filter(pk=keep.pk).exists()
    assert ZipJob.objects.get(pk=stuck.pk).status == "failed"
    assert not [
        o
        for o in s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("Contents", [])
        if o["Key"] == old.key
    ]
    assert cleanup_zips() == 0


def test_cleanup_is_scheduled_hourly(settings):
    entry = settings.CELERY_BEAT_SCHEDULE["galleries-cleanup-zips"]
    assert entry["task"] == "apps.galleries.tasks.cleanup_zips" and entry["schedule"] == 3600.0


def test_the_management_command_runs(capsys):
    from django.core.management import call_command

    call_command("cleanup_gallery_zips")
    assert "removed 0" in capsys.readouterr().out


# ---- finished files ---------------------------------------------------------------------------------


def upload_final(owner_client, gid, name="final.jpg", data=None):
    blob = data or image_bytes(color="#abcdef", size=(800, 600))
    return owner_client.post(
        f"{ADMIN}{gid}/finals/", {"file": SimpleUploadedFile(name, blob, "image/jpeg")}, format="multipart"
    )


def test_finals_are_uploaded_by_the_owner_and_always_downloadable(owner_client, client, s3_buckets, settings):
    gallery, _ = make_gallery(s3_buckets, download_level="none", count=1)
    r = upload_final(owner_client, gallery.pk)
    assert r.status_code == 201 and r.data["filename"] == "final.jpg"
    private = [o["Key"] for o in s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET)["Contents"]]
    assert any("/finals/" in k for k in private)
    assert s3_buckets.list_objects_v2(Bucket=settings.S3_PUBLIC_BUCKET).get("KeyCount", 0) == 0
    h = authed(client, gallery)
    listed = client.get(url(gallery, "/finals"), **h).data["finals"]
    assert [f["filename"] for f in listed] == ["final.jpg"]
    link = client.get(url(gallery, f"/finals/{listed[0]['id']}/download"), **h)
    assert link.status_code == 200 and "/finals/" in link.data["url"]  # even though the level is «none»
    assert DownloadLog.objects.filter(kind="final").count() == 1
    assert client.get(url(gallery, f"/finals/{listed[0]['id']}/download")).status_code == 401


def test_finals_need_the_owner_and_an_image(owner_client, client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    assert client.post(f"{ADMIN}{gallery.pk}/finals/").status_code in (401, 403)
    bad = owner_client.post(
        f"{ADMIN}{gallery.pk}/finals/",
        {"file": SimpleUploadedFile("x.jpg", b"not an image", "image/jpeg")},
        format="multipart",
    )
    assert bad.status_code == 400 and FinalFile.objects.count() == 0


def test_a_final_is_removed_with_its_file_and_only_through_its_own_gallery(owner_client, s3_buckets, settings):
    first, _ = make_gallery(s3_buckets, count=1)
    second, _ = make_gallery(s3_buckets, count=1)
    final = upload_final(owner_client, first.pk).data
    assert owner_client.delete(f"{ADMIN}{second.pk}/finals/{final['id']}/").status_code == 404
    assert owner_client.delete(f"{ADMIN}{first.pk}/finals/{final['id']}/").status_code == 204
    assert not [
        o
        for o in s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("Contents", [])
        if "/finals/" in o["Key"]
    ]


def test_the_owner_sees_the_download_log_and_space_used(owner_client, client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="all_web", count=2)
    upload_final(owner_client, gallery.pk)
    h = authed(client, gallery)
    client.get(url(gallery, f"/photos/{photos[0].pk}/download"), **h)
    client.post(url(gallery, "/zip"), **h)
    log = owner_client.get(f"{ADMIN}{gallery.pk}/downloads/")
    assert log.status_code == 200 and [r["kind"] for r in log.data] == ["photo"]
    status = client.get(url(gallery, f"/zip/{ZipJob.objects.get().pk}"), **h)
    assert status.data["status"] == "ready"
    assert [r["kind"] for r in owner_client.get(f"{ADMIN}{gallery.pk}/downloads/").data] == ["zip", "photo"]
    row = owner_client.get(f"{ADMIN}{gallery.pk}/").data
    final = FinalFile.objects.get()
    zipped = ZipJob.objects.get()
    photo_bytes = sum(p.size_bytes + p.stored_bytes for p in GalleryPhoto.objects.filter(gallery=gallery))
    assert row["usage_bytes"] == photo_bytes + final.size_bytes + zipped.size_bytes
    assert client.get(f"{ADMIN}{gallery.pk}/downloads/").status_code in (401, 403)


def test_deleting_a_gallery_removes_finals_and_zips_too(owner_client, client, s3_buckets, settings):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    upload_final(owner_client, gallery.pk)
    client.post(url(gallery, "/zip"), **authed(client, gallery))
    assert owner_client.delete(f"{ADMIN}{gallery.pk}/").status_code == 204
    assert s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("KeyCount", 0) == 0


def test_selection_rows_do_not_leak_into_downloads_of_other_galleries(client, s3_buckets):
    first, photos = make_gallery(s3_buckets, download_level="selected", count=1)
    second, _ = make_gallery(s3_buckets, download_level="selected", count=1)
    choose(client, first, photos, authed(client, first), 0)
    assert Selection.objects.count() == 1
    assert client.post(url(second, "/zip"), **authed(client, second)).status_code == 409


def test_a_zip_is_refused_when_the_level_or_the_choices_have_narrowed(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, download_level="all_original", count=3)
    h = authed(client, gallery)
    job = client.post(url(gallery, "/zip"), **h).data
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).data["status"] == "ready"
    # originals were built; the owner now allows only the display size
    Gallery.objects.filter(pk=gallery.pk).update(download_level="all_web")
    stale = client.get(url(gallery, f"/zip/{job['id']}"), **h)
    assert stale.status_code == 409 and stale.data["code"] == "stale" and "url" not in stale.data
    # everything was built; now only the chosen photos may be taken (and none is chosen)
    Gallery.objects.filter(pk=gallery.pk).update(download_level="all_original")
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).status_code == 200
    Gallery.objects.filter(pk=gallery.pk).update(download_level="selected_original")
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).status_code == 409


def test_an_unselected_photo_makes_a_chosen_only_zip_stale(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="selected", count=2)
    h = authed(client, gallery)
    choose(client, gallery, photos, h, 0, 1)
    job = client.post(url(gallery, "/zip"), **h).data
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).status_code == 200
    put(client, gallery, photos[1], h, selected=False)
    assert client.get(url(gallery, f"/zip/{job['id']}"), **h).data["code"] == "stale"
    assert DownloadLog.objects.filter(kind="zip").count() == 1  # the refused request issued no link


def test_a_job_given_up_on_does_not_become_ready_again(s3_buckets, settings, monkeypatch):
    gallery, _ = make_gallery(s3_buckets, download_level="all_web", count=1)
    monkeypatch.setattr("apps.galleries.tasks.build_zip.apply_async", lambda *a, **k: None)
    job = service.start_zip(gallery)
    real = service.file_name

    def cleanup_meanwhile(photo, originals):
        ZipJob.objects.filter(pk=job.pk).update(status="failed", error="timeout")  # as cleanup_zips does
        return real(photo, originals)

    monkeypatch.setattr(service, "file_name", cleanup_meanwhile)
    assert build_zip.run(job.pk) == "gone"
    assert ZipJob.objects.get(pk=job.pk).status == "failed"
    left = s3_buckets.list_objects_v2(Bucket=settings.S3_PRIVATE_BUCKET).get("Contents", [])
    assert not [o for o in left if "/zips/" in o["Key"]]  # the archive it had just built is deleted


def test_the_owner_sees_the_choices_notes_and_names_for_lightroom(owner_client, client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, download_level="selected", count=4)
    h = authed(client, gallery)
    choose(client, gallery, photos, h, 0, 2)
    put(client, gallery, photos[2], h, comment="روشن‌تر", retouch=True)
    put(client, gallery, photos[3], h, comment="فقط نظر")
    r = owner_client.get(f"{ADMIN}{gallery.pk}/selections/")
    assert r.status_code == 200
    assert (r.data["photo_count"], r.data["selected_count"], r.data["retouch_count"], r.data["comment_count"]) == (
        4,
        2,
        1,
        2,
    )
    assert r.data["filenames"] == "IMG_0, IMG_2"  # without extension, commas, in gallery order
    assert [i["photo"] for i in r.data["items"]] == [photos[0].pk, photos[2].pk, photos[3].pk]
    assert all("/storage-signed/" in i["thumb_url"] for i in r.data["items"])
    only = lambda q: [i["photo"] for i in owner_client.get(f"{ADMIN}{gallery.pk}/selections/?only={q}").data["items"]]  # noqa: E731
    assert only("selected") == [photos[0].pk, photos[2].pk]
    assert only("retouch") == [photos[2].pk]
    assert only("commented") == [photos[2].pk, photos[3].pk]
    assert client.get(f"{ADMIN}{gallery.pk}/selections/").status_code in (401, 403)
