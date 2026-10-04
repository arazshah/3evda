import io
from datetime import timedelta

import pytest
from celery.exceptions import Retry
from django.core.files.uploadedfile import SimpleUploadedFile
from django.utils import timezone
from PIL import Image

from apps.audit.models import AuditLog
from apps.galleries import service
from apps.galleries.links import find_by_token, make_token
from apps.galleries.models import Gallery, GalleryPhoto
from apps.media.tests.factories import image_bytes

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _commit_hooks_run_at_once(monkeypatch):
    """Tests run inside a transaction that is never committed; work queued «after commit» would never start."""
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())


ADMIN = "/api/admin/galleries/"


def keys(s3, settings, bucket=None):
    out = s3.list_objects_v2(Bucket=bucket or settings.S3_PRIVATE_BUCKET)
    return sorted(o["Key"] for o in out.get("Contents", []))


def make(client, **extra):
    r = client.post(ADMIN, {"title": "جلسه‌ی کافه", "client_name": "سارا"} | extra, format="json")
    assert r.status_code == 201, r.data
    return r.data


def upload(client, gid, color="#c9822c", name="IMG_0001.jpg", data=None):
    blob = data or image_bytes(color=color, size=(2400, 1600))
    return client.post(
        f"{ADMIN}{gid}/photos/", {"file": SimpleUploadedFile(name, blob, "image/jpeg")}, format="multipart"
    )


def with_photo(client):
    g = make(client)
    p = upload(client, g["id"])
    assert p.status_code == 201, p.data
    return g, p.data


# ---- the gallery ----------------------------------------------------------------------------------


def test_new_gallery_defaults_and_link(owner_client):
    g = make(owner_client)
    assert g["status"] == "draft" and g["has_password"] is False and g["selection_limit"] is None
    assert g["download_level"] == "selected" and g["watermark"] is True and g["photo_count"] == 0
    token = g["link"].rsplit("/g/", 1)[1]
    assert len(token.split("_")[0]) == 32 and "." not in token
    assert AuditLog.objects.filter(action="galleries.gallery.create").count() == 1


def test_the_password_is_stored_hashed_and_never_returned(owner_client):
    g = make(owner_client, password="رمز-خیلی-خصوصی")
    assert g["has_password"] is True and "password" not in g and "password_hash" not in g
    row = Gallery.objects.get(pk=g["id"])
    assert row.password_hash and "خصوصی" not in row.password_hash
    kept = owner_client.patch(f"{ADMIN}{g['id']}/", {"title": "جدید"}, format="json")
    assert kept.data["has_password"] is True  # not touched by another edit
    cleared = owner_client.patch(f"{ADMIN}{g['id']}/", {"clear_password": True}, format="json")
    assert cleared.data["has_password"] is False
    log = AuditLog.objects.filter(action="galleries.gallery.update").first()
    assert "خصوصی" not in str(log.metadata)


def test_every_download_level_names_its_scope(owner_client):
    levels = [c for c, _ in Gallery.DownloadLevel.choices]
    assert levels == ["none", "selected", "all_web", "selected_original", "all_original"]
    for level in levels:
        assert make(owner_client, download_level=level)["download_level"] == level


def test_validation(owner_client):
    assert owner_client.post(ADMIN, {"client_name": "x"}, format="json").status_code == 400
    assert owner_client.post(ADMIN, {"title": "x", "selection_limit": 0}, format="json").status_code == 400
    assert owner_client.post(ADMIN, {"title": "x", "download_level": "everything"}, format="json").status_code == 400
    assert (
        owner_client.post(ADMIN, {"title": "x", "download_level": "original"}, format="json").status_code == 400
    )  # say which originals


def test_the_link_is_signed_and_a_new_link_cancels_the_old_one(owner_client):
    g = make(owner_client)
    row = Gallery.objects.get(pk=g["id"])
    old = make_token(row)
    assert find_by_token(old) == row
    pub, sig = old.split("_", 1)
    for bad in ["", "x", f"{pub}_", f"{pub}_{sig[:-2]}ab", f"{'0' * 32}_{sig}", f"{pub}.{sig}", pub]:
        assert find_by_token(bad) is None, bad
    fresh = owner_client.post(f"{ADMIN}{g['id']}/new-link/").data["link"]
    assert fresh != g["link"]
    assert find_by_token(old) is None and find_by_token(fresh.rsplit("/g/", 1)[1]) == row


def test_an_expired_gallery_shows_as_expired_and_a_draft_does_not(owner_client):
    g = make(owner_client, expires_at=(timezone.now() - timedelta(days=1)).isoformat())
    assert g["status"] == "draft"
    Gallery.objects.filter(pk=g["id"]).update(status="published")
    assert owner_client.get(f"{ADMIN}{g['id']}/").data["status"] == "expired"
    Gallery.objects.filter(pk=g["id"]).update(expires_at=timezone.now() + timedelta(days=1))
    assert owner_client.get(f"{ADMIN}{g['id']}/").data["status"] == "published"


def test_anonymous_is_refused(client):
    assert client.get(ADMIN).status_code in (401, 403)
    assert client.post(f"{ADMIN}1/photos/").status_code in (401, 403)


# ---- photos ---------------------------------------------------------------------------------------


def test_a_photo_is_stored_privately_and_gets_watermarked_previews(owner_client, s3_buckets, settings):
    g, photo = with_photo(owner_client)
    assert photo["status"] == "ready" and photo["width"] == 2400 and photo["height"] == 1600
    stored = keys(s3_buckets, settings)
    assert len([k for k in stored if "/originals/" in k]) == 1
    assert (
        len([k for k in stored if k.endswith("-thumb.webp")]) == 1
        and len([k for k in stored if k.endswith("-preview.webp")]) == 1
    )
    assert all(k.startswith(f"galleries/{Gallery.objects.get(pk=g['id']).public_id.hex}/") for k in stored)
    assert keys(s3_buckets, settings, settings.S3_PUBLIC_BUCKET) == []  # nothing a visitor could find
    assert photo["thumb_url"].startswith("/storage-signed/") and "X-Amz-Signature" in photo["thumb_url"]
    row = GalleryPhoto.objects.get()
    for key, wide in ((row.thumb_key, 600), (row.preview_key, 2000)):
        body = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key)["Body"].read()
        assert Image.open(io.BytesIO(body)).width == wide
    assert row.stored_bytes > 0 and row.size_bytes > 0


def test_previews_carry_the_watermark_only_when_the_gallery_says_so(owner_client, s3_buckets, settings):
    marked = make(owner_client, watermark=True)
    plain = make(owner_client, watermark=False)
    blob = image_bytes(color="#335577", size=(1600, 1000))
    upload(owner_client, marked["id"], data=blob)
    upload(owner_client, plain["id"], data=blob)

    def preview(gallery_id):
        photo = GalleryPhoto.objects.get(gallery_id=gallery_id)
        return Image.open(
            io.BytesIO(s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=photo.preview_key)["Body"].read())
        ).convert("RGB")

    a, b = preview(marked["id"]), preview(plain["id"])
    assert a.size == b.size and a.tobytes() != b.tobytes()
    assert b.getcolors(maxcolors=50) is not None  # the plain one is a flat colour


def test_the_previews_have_no_location_data(owner_client, s3_buckets, settings):
    g = make(owner_client)
    assert upload(owner_client, g["id"], data=image_bytes(gps=True, size=(1200, 800))).status_code == 201
    row = GalleryPhoto.objects.get()
    for key in (row.thumb_key, row.preview_key):
        img = Image.open(io.BytesIO(s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key)["Body"].read()))
        assert 0x8825 not in img.getexif()


def test_the_same_photo_twice_is_refused(owner_client, s3_buckets, settings):
    g = make(owner_client)
    assert upload(owner_client, g["id"]).status_code == 201
    r = upload(owner_client, g["id"], name="copy.jpg")
    assert r.status_code == 409 and r.data["code"] == "duplicate"
    assert GalleryPhoto.objects.count() == 1 and len([k for k in keys(s3_buckets, settings) if "/originals/" in k]) == 1
    other = make(owner_client)
    assert upload(owner_client, other["id"]).status_code == 201  # another gallery may hold the same photo


@pytest.mark.parametrize(
    "name,content",
    [
        ("a.txt", b"hello"),
        ("a.pdf", b"%PDF-1.4\n%%EOF"),
        ("a.jpg", b"\xff\xd8\xff junk that is no image"),
        ("a.mp4", b"\x00\x00\x00\x18ftypisom\x00\x00\x02\x00isomiso2"),
    ],
)
def test_other_files_are_refused_and_nothing_is_stored(owner_client, s3_buckets, settings, name, content):
    g = make(owner_client)
    r = upload(owner_client, g["id"], name=name, data=content)
    assert r.status_code == 400 and GalleryPhoto.objects.count() == 0
    assert keys(s3_buckets, settings) == []


def test_missing_file_is_a_clear_error(owner_client):
    g = make(owner_client)
    assert owner_client.post(f"{ADMIN}{g['id']}/photos/", {}, format="multipart").status_code == 400


def test_a_gallery_holds_a_limited_number_of_photos(owner_client, s3_buckets, settings):
    settings.GALLERY_MAX_PHOTOS = 2
    g = make(owner_client)
    assert upload(owner_client, g["id"], "#111111").status_code == 201
    assert upload(owner_client, g["id"], "#222222").status_code == 201
    r = upload(owner_client, g["id"], "#333333")
    assert r.status_code == 409 and r.data["code"] == "too_many"
    assert GalleryPhoto.objects.count() == 2 and len([k for k in keys(s3_buckets, settings) if "/originals/" in k]) == 2


def test_a_photo_that_cannot_be_processed_is_marked_failed(owner_client, s3_buckets, settings, monkeypatch):
    def boom(data):
        raise RuntimeError("no")

    monkeypatch.setattr("apps.galleries.tasks.load_normalized", boom)
    g = make(owner_client)
    r = upload(owner_client, g["id"])
    assert r.status_code == 201 and r.data["status"] == "failed" and r.data["thumb_url"] is None
    assert "RuntimeError" in GalleryPhoto.objects.get().error


def test_a_busy_store_is_retried_and_only_the_last_failure_marks_the_photo(owner_client, s3_buckets, monkeypatch):
    from apps.galleries.tasks import process_photo

    g = make(owner_client)
    photo = upload(owner_client, g["id"]).data
    GalleryPhoto.objects.filter(pk=photo["id"]).update(status="processing")

    class Busy:
        def open(self, key):
            raise ConnectionError("store busy")

    monkeypatch.setattr("apps.galleries.tasks.private_storage", lambda: Busy())
    retried = []

    def retry(exc=None, **kw):
        retried.append(exc)
        return Retry()

    monkeypatch.setattr(process_photo, "retry", retry)
    process_photo.push_request(retries=0, called_directly=False, args=(photo["id"],), kwargs={})
    try:
        with pytest.raises(Retry):
            process_photo.run(photo["id"])
    finally:
        process_photo.pop_request()
    assert len(retried) == 1 and isinstance(retried[0], ConnectionError)
    assert GalleryPhoto.objects.get(pk=photo["id"]).status == "processing"  # not failed for good
    process_photo.push_request(retries=process_photo.max_retries, called_directly=False, args=(photo["id"],), kwargs={})
    try:
        assert process_photo.run(photo["id"]) == "failed"
    finally:
        process_photo.pop_request()


def test_renditions_fit_the_long_edge_and_carry_no_metadata(owner_client, s3_buckets, settings):
    g = make(owner_client)
    blob = image_bytes(color="#445566", size=(1600, 2400))
    p = upload(owner_client, g["id"], data=blob).data
    row = GalleryPhoto.objects.get(pk=p["id"])
    for key, edge in ((row.thumb_key, settings.GALLERY_THUMB_WIDTH), (row.preview_key, settings.GALLERY_PREVIEW_WIDTH)):
        body = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=key)["Body"].read()
        img = Image.open(io.BytesIO(body))
        assert max(img.size) <= edge and img.height > img.width
        assert not dict(img.getexif()) and b"Exif" not in body[:64]


def test_previews_made_for_a_deleted_photo_are_removed(owner_client, s3_buckets, settings, monkeypatch):
    from apps.galleries import tasks

    g = make(owner_client)
    photo = upload(owner_client, g["id"]).data
    pk = photo["id"]
    real = tasks.fit_long_edge

    def delete_midway(img, edge):
        GalleryPhoto.objects.filter(pk=pk).delete()  # the owner deletes it while the worker works
        return real(img, edge)

    row = GalleryPhoto.objects.get(pk=pk)
    for old in (row.thumb_key, row.preview_key):  # the first, eager run is not what is being tested
        s3_buckets.delete_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=old)
    GalleryPhoto.objects.filter(pk=pk).update(status="processing", thumb_key="", preview_key="")
    monkeypatch.setattr(tasks, "fit_long_edge", delete_midway)
    assert tasks.process_photo.run(pk) == "gone"
    assert not [k for k in keys(s3_buckets, settings) if "/previews/" in k]


def test_an_upload_that_met_an_archive_during_checks_is_refused(owner_client, s3_buckets, monkeypatch):
    g = make(owner_client)
    row = Gallery.objects.get(pk=g["id"])
    real = service._sha256

    def archive_meanwhile(upload):
        Gallery.objects.filter(pk=row.pk).update(status="archived")
        return real(upload)

    monkeypatch.setattr(service, "_sha256", archive_meanwhile)
    with pytest.raises(service.GalleryError) as e:
        service.add_photo(row, SimpleUploadedFile("a.jpg", image_bytes(), "image/jpeg"))
    assert e.value.code == "archived" and GalleryPhoto.objects.count() == 0


def test_a_gallery_without_a_date_expires_in_thirty_days(owner_client):
    g = make(owner_client)
    left = Gallery.objects.get(pk=g["id"]).expires_at - timezone.now()
    assert timedelta(days=29, hours=23) < left <= timedelta(days=30)


def test_a_photo_deleted_while_waiting_is_simply_skipped(db):
    from apps.galleries.tasks import process_photo

    assert process_photo(999999) == "gone"


def test_photos_can_be_reordered_and_the_list_must_be_complete(owner_client, s3_buckets):
    g = make(owner_client)
    ids = [upload(owner_client, g["id"], c).data["id"] for c in ("#111111", "#222222", "#333333")]
    assert [p["id"] for p in owner_client.get(f"{ADMIN}{g['id']}/photos/").data] == ids
    assert owner_client.patch(f"{ADMIN}{g['id']}/photos/order/", {"ids": ids[::-1]}, format="json").status_code == 204
    assert [p["id"] for p in owner_client.get(f"{ADMIN}{g['id']}/photos/").data] == ids[::-1]
    for bad in (ids[:2], [*ids, 999], [ids[0]] * 3):
        assert owner_client.patch(f"{ADMIN}{g['id']}/photos/order/", {"ids": bad}, format="json").status_code == 400


def test_deleting_a_photo_removes_its_files(owner_client, s3_buckets, settings):
    g, photo = with_photo(owner_client)
    assert len(keys(s3_buckets, settings)) == 3
    assert owner_client.delete(f"{ADMIN}{g['id']}/photos/{photo['id']}/").status_code == 204
    assert GalleryPhoto.objects.count() == 0 and keys(s3_buckets, settings) == []
    assert owner_client.delete(f"{ADMIN}{g['id']}/photos/{photo['id']}/").status_code == 404
    other = make(owner_client)
    assert owner_client.delete(f"{ADMIN}{other['id']}/photos/x/").status_code == 404


def test_a_photo_cannot_be_deleted_through_another_gallery(owner_client, s3_buckets):
    _g, photo = with_photo(owner_client)
    other = make(owner_client)
    assert owner_client.delete(f"{ADMIN}{other['id']}/photos/{photo['id']}/").status_code == 404
    assert GalleryPhoto.objects.count() == 1


def test_deleting_a_gallery_removes_every_file(owner_client, s3_buckets, settings):
    g = make(owner_client)
    for color in ("#111111", "#222222"):
        upload(owner_client, g["id"], color)
    assert len(keys(s3_buckets, settings)) == 6
    assert owner_client.delete(f"{ADMIN}{g['id']}/").status_code == 204
    assert Gallery.objects.count() == 0 and keys(s3_buckets, settings) == []
    assert AuditLog.objects.filter(action="galleries.gallery.delete").count() == 1


def test_files_the_store_could_not_remove_are_tried_again(monkeypatch):
    from apps.galleries.tasks import delete_files

    class Broken:
        def delete(self, key):
            raise OSError("busy")

    monkeypatch.setattr("apps.galleries.tasks.private_storage", lambda: Broken())
    # Called directly (not through the eager runner, which would leave the task stack dirty for other tests).
    with pytest.raises(Retry):
        delete_files.run(["a", "b"])


def test_counts_and_space_used(owner_client, s3_buckets):
    g, photo = with_photo(owner_client)
    upload(owner_client, g["id"], "#222222")
    GalleryPhoto.objects.filter(pk=photo["id"]).update(status="failed")
    d = owner_client.get(f"{ADMIN}{g['id']}/").data
    row = GalleryPhoto.objects.filter(gallery_id=g["id"])
    assert d["photo_count"] == 2 and d["ready_count"] == 1
    assert (
        d["usage_bytes"]
        == sum(p.size_bytes + p.stored_bytes for p in row)
        == service.usage_bytes(Gallery.objects.get(pk=g["id"]))
    )
    assert (
        owner_client.get(ADMIN).data["results"][0]["photo_count"] == 2
        if "results" in owner_client.get(ADMIN).data
        else True
    )


# ---- states ---------------------------------------------------------------------------------------


def test_publishing_needs_a_ready_photo_and_only_works_once(owner_client, s3_buckets):
    g = make(owner_client)
    r = owner_client.post(f"{ADMIN}{g['id']}/publish/")
    assert r.status_code == 409 and r.data["code"] == "no_photos"
    upload(owner_client, g["id"])
    assert owner_client.post(f"{ADMIN}{g['id']}/publish/").data["status"] == "published"
    assert owner_client.post(f"{ADMIN}{g['id']}/publish/").status_code == 409


def test_reopen_archive_and_unarchive(owner_client, s3_buckets):
    g, _ = with_photo(owner_client)
    assert owner_client.post(f"{ADMIN}{g['id']}/reopen/").status_code == 409  # nothing submitted
    Gallery.objects.filter(pk=g["id"]).update(status="submitted")
    assert owner_client.post(f"{ADMIN}{g['id']}/reopen/").data["status"] == "published"
    assert owner_client.post(f"{ADMIN}{g['id']}/archive/").data["status"] == "archived"
    assert upload(owner_client, g["id"], "#999999").status_code == 409  # not into an archived gallery
    assert owner_client.post(f"{ADMIN}{g['id']}/unarchive/").data["status"] == "published"
    assert owner_client.post(f"{ADMIN}{g['id']}/unarchive/").status_code == 409
    empty = make(owner_client)
    owner_client.post(f"{ADMIN}{empty['id']}/archive/")
    assert owner_client.post(f"{ADMIN}{empty['id']}/unarchive/").data["status"] == "draft"


def test_a_gallery_can_be_tied_to_an_enquiry_a_booking_and_a_proforma(owner_client):
    from apps.inquiries.models import Inquiry

    inquiry = Inquiry.objects.create(name="ا", phone="1")
    g = make(owner_client, inquiry=inquiry.pk)
    assert g["inquiry"] == inquiry.pk
    inquiry.delete()
    assert owner_client.get(f"{ADMIN}{g['id']}/").data["inquiry"] is None  # the gallery outlives it
