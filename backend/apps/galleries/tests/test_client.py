import threading
from datetime import timedelta

import pytest
from django.core.cache import cache
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection
from django.utils import timezone
from rest_framework.test import APIClient

from apps.galleries import access, service
from apps.galleries.links import make_token
from apps.galleries.models import Gallery, GalleryPhoto, Selection
from apps.media.tests.factories import image_bytes

pytestmark = pytest.mark.django_db


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())
    cache.clear()


@pytest.fixture
def client():
    return APIClient()


API = "/api/public/galleries/"


def make_gallery(s3, count=3, **extra) -> tuple[Gallery, list[GalleryPhoto]]:
    gallery = Gallery.objects.create(title="جلسه‌ی کافه", client_name="سارا", status="published", **extra)
    photos = []
    for i in range(count):
        blob = image_bytes(color=(40 * i + 10, 90, 150), size=(1200, 800))
        photos.append(service.add_photo(gallery, SimpleUploadedFile(f"IMG_{i}.jpg", blob, "image/jpeg")))
    return gallery, photos


def url(gallery, tail=""):
    return f"{API}{make_token(gallery)}{tail}"


def unlock(client, gallery, password=None):
    body = {"password": password} if password is not None else {}
    return client.post(url(gallery, "/unlock"), body, format="json")


def authed(client, gallery, password=None):
    r = unlock(client, gallery, password)
    assert r.status_code == 200, r.data
    return {"HTTP_X_GALLERY_TOKEN": r.data["token"]}


def put(client, gallery, photo, headers, **body):
    return client.put(url(gallery, f"/photos/{photo.pk}/selection"), body, format="json", **headers)


# ---- reaching the gallery ---------------------------------------------------------------------------


def test_the_link_shows_only_the_basics(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets)
    r = client.get(url(gallery))
    assert r.status_code == 200 and r["Cache-Control"] == "no-store"
    assert r.data["title"] == "جلسه‌ی کافه" and r.data["has_password"] is False and r.data["status"] == "published"
    assert "photos" not in r.data and "password_hash" not in r.data


@pytest.mark.parametrize("bad", ["x", "0" * 32 + "_abc", "0" * 32])
def test_a_forged_link_is_not_found(client, s3_buckets, bad):
    assert client.get(f"{API}{bad}").status_code == 404
    assert client.get(f"{API}{bad}/photos").status_code == 404
    assert client.post(f"{API}{bad}/unlock", {}, format="json").status_code == 403


def test_a_revoked_link_stops_working(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    old = url(gallery)
    service.new_link(gallery)
    assert client.get(old).status_code == 404
    assert client.get(url(gallery)).status_code == 200


@pytest.mark.parametrize("state", ["draft", "archived"])
def test_a_draft_or_archived_gallery_does_not_exist_for_the_client(client, s3_buckets, state):
    gallery, _ = make_gallery(s3_buckets, count=1)
    Gallery.objects.filter(pk=gallery.pk).update(status=state)
    assert client.get(url(gallery)).status_code == 404
    refused = unlock(client, gallery)
    assert refused.status_code == 403 and refused.data["code"] == "locked"


def test_an_expired_gallery_says_so_and_gives_nothing(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    Gallery.objects.filter(pk=gallery.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert client.get(url(gallery)).data["status"] == "expired"
    assert unlock(client, gallery).status_code == 410


def test_photos_need_the_access_token(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    r = client.get(url(gallery, "/photos"))
    assert r.status_code == 401 and r.data["code"] == "locked"
    assert client.get(url(gallery, "/photos"), HTTP_X_GALLERY_TOKEN="123.abc").status_code == 401


# ---- passwords --------------------------------------------------------------------------------------


def test_a_gallery_without_a_password_gives_a_token_at_once(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=2)
    headers = authed(client, gallery)
    r = client.get(url(gallery, "/photos"), **headers)
    assert r.status_code == 200 and len(r.data["photos"]) == 2 and r["Cache-Control"] == "no-store"


def test_a_password_is_needed_and_wrong_ones_are_refused(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    service.set_password(gallery, "راز-بزرگ")
    gallery.save()
    assert unlock(client, gallery).status_code == 403  # none
    assert unlock(client, gallery, "اشتباه").status_code == 403
    headers = authed(client, gallery, "راز-بزرگ")
    assert client.get(url(gallery, "/photos"), **headers).status_code == 200
    assert client.get(url(gallery)).data["has_password"] is True


def test_wrong_password_and_missing_gallery_answer_alike(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    service.set_password(gallery, "راز")
    gallery.save()
    wrong = unlock(client, gallery, "x")
    missing = client.post(f"{API}{'0' * 32}_zzz/unlock", {"password": "x"}, format="json")
    assert (wrong.status_code, dict(wrong.data)) == (missing.status_code, dict(missing.data))


def test_guessing_is_stopped_after_five_wrong_tries(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    service.set_password(gallery, "درست")
    gallery.save()
    for _ in range(5):
        assert unlock(client, gallery, "غلط").status_code == 403
    blocked = unlock(client, gallery, "درست")  # even the right one waits
    assert blocked.status_code == 429 and blocked.data["code"] == "too_many"
    other = APIClient(REMOTE_ADDR="198.51.100.9")
    assert unlock(other, gallery, "درست").status_code == 200  # another visitor is not blocked


def test_the_per_gallery_ceiling_stops_a_spread_out_guesser(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    service.set_password(gallery, "درست")
    gallery.save()
    for i in range(access.PER_GALLERY[0]):
        guesser = APIClient(REMOTE_ADDR=f"203.0.113.{i + 1}")
        assert unlock(guesser, gallery, "غلط").status_code == 403
    late = APIClient(REMOTE_ADDR="203.0.113.250")
    assert unlock(late, gallery, "درست").status_code == 429


def test_a_token_is_for_one_gallery_and_ends_with_a_new_link_or_password(client, s3_buckets):
    first, _ = make_gallery(s3_buckets, count=1)
    second, _ = make_gallery(s3_buckets, count=1)
    headers = authed(client, first)
    assert client.get(url(second, "/photos"), **headers).status_code == 401  # someone else's gallery
    service.new_link(first)
    assert client.get(url(first, "/photos"), **headers).status_code == 401
    headers = authed(client, first)
    service.set_password(first, "تازه")
    first.save()
    assert client.get(url(first, "/photos"), **headers).status_code == 401


def test_an_expired_token_is_refused(client, s3_buckets):
    gallery, _ = make_gallery(s3_buckets, count=1)
    old = access.make_access_token(gallery, now=0)
    assert not access.check_access_token(gallery, old)
    assert client.get(url(gallery, "/photos"), HTTP_X_GALLERY_TOKEN=old).status_code == 401
    assert not access.check_access_token(gallery, "abc.def") and not access.check_access_token(gallery, "")


# ---- the photos -------------------------------------------------------------------------------------


def test_the_list_gives_signed_previews_for_ready_photos_only(client, s3_buckets, settings):
    gallery, photos = make_gallery(s3_buckets, count=2)
    GalleryPhoto.objects.filter(pk=photos[1].pk).update(status="failed")
    headers = authed(client, gallery)
    data = client.get(url(gallery, "/photos"), **headers).data
    assert [p["id"] for p in data["photos"]] == [photos[0].pk]
    photo = data["photos"][0]
    assert (
        photo["preview_url"].startswith("/storage-signed/") and "Signature" in photo["preview_url"]
    ) or "X-Amz" in photo["preview_url"]
    body = str(data)
    assert "originals" not in body and "original_key" not in body  # the original never appears
    assert str(photos[0].original_key) not in body


def test_nothing_in_the_public_bucket(client, s3_buckets, settings):
    make_gallery(s3_buckets, count=1)
    out = s3_buckets.list_objects_v2(Bucket=settings.S3_PUBLIC_BUCKET)
    assert out.get("KeyCount", 0) == 0


# ---- choosing ---------------------------------------------------------------------------------------


def test_select_comment_and_retouch(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets)
    h = authed(client, gallery)
    r = put(client, gallery, photos[0], h, selected=True, comment="لطفاً روشن‌تر", retouch=True)
    assert r.status_code == 200 and r.data == {
        "selected": True, "comment": "لطفاً روشن‌تر", "retouch": True, "selected_count": 1,
    }  # fmt: skip
    again = put(client, gallery, photos[0], h, selected=True, comment="لطفاً روشن‌تر", retouch=True)
    assert again.data == r.data and Selection.objects.count() == 1  # idempotent
    listed = client.get(url(gallery, "/photos"), **h).data
    first = next(p for p in listed["photos"] if p["id"] == photos[0].pk)
    assert first["selected"] and first["retouch"] and first["comment"] == "لطفاً روشن‌تر"
    assert listed["selected_count"] == 1
    # a partial update leaves the rest alone
    assert put(client, gallery, photos[0], h, selected=False).data["comment"] == "لطفاً روشن‌تر"


def test_a_comment_is_limited_and_kept_as_plain_text(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, count=1)
    h = authed(client, gallery)
    assert put(client, gallery, photos[0], h, comment="x" * 501).status_code == 400
    evil = "<script>alert(1)</script>"
    r = put(client, gallery, photos[0], h, comment=evil)
    assert r.status_code == 200 and r.data["comment"] == evil  # stored as typed; the page escapes it
    assert "application/json" in r["Content-Type"]


def test_the_limit_is_enforced_and_unselecting_makes_room(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, selection_limit=2)
    h = authed(client, gallery)
    assert put(client, gallery, photos[0], h, selected=True).status_code == 200
    assert put(client, gallery, photos[1], h, selected=True).status_code == 200
    over = put(client, gallery, photos[2], h, selected=True)
    assert over.status_code == 409 and over.data["code"] == "limit_reached"
    assert put(client, gallery, photos[0], h, selected=True).status_code == 200  # already chosen: not new
    assert put(client, gallery, photos[2], h, comment="فقط یادداشت").status_code == 200  # a note is not a pick
    put(client, gallery, photos[0], h, selected=False)
    assert put(client, gallery, photos[2], h, selected=True).data["selected_count"] == 2


def test_a_photo_of_another_gallery_cannot_be_chosen(client, s3_buckets):
    mine, _ = make_gallery(s3_buckets, count=1)
    _other, others = make_gallery(s3_buckets, count=1)
    h = authed(client, mine)
    r = client.put(url(mine, f"/photos/{others[0].pk}/selection"), {"selected": True}, format="json", **h)
    assert r.status_code == 404 and Selection.objects.count() == 0


def test_a_photo_that_is_not_ready_cannot_be_chosen(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets, count=1)
    GalleryPhoto.objects.filter(pk=photos[0].pk).update(status="failed")
    h = authed(client, gallery)
    assert put(client, gallery, photos[0], h, selected=True).status_code == 404


# ---- sending ----------------------------------------------------------------------------------------


def test_submit_locks_the_choices_and_the_owner_can_reopen(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets)
    h = authed(client, gallery)
    empty = client.post(url(gallery, "/submit"), **h)
    assert empty.status_code == 409 and empty.data["code"] == "nothing_selected"
    put(client, gallery, photos[0], h, selected=True)
    done = client.post(url(gallery, "/submit"), **h)
    assert done.status_code == 200 and done.data == {"submitted": True, "selected_count": 1}
    row = Gallery.objects.get(pk=gallery.pk)
    assert row.status == "submitted" and row.submitted_at and len(row.submitted_ip_hash) == 64
    stamp = row.submitted_at
    assert client.post(url(gallery, "/submit"), **h).status_code == 200  # again: no change
    assert Gallery.objects.get(pk=gallery.pk).submitted_at == stamp
    locked = put(client, gallery, photos[1], h, selected=True)
    assert locked.status_code == 409 and locked.data["code"] == "submitted"
    assert client.get(url(gallery, "/photos"), **h).data["submitted"] is True
    service.reopen(Gallery.objects.get(pk=gallery.pk))
    assert put(client, gallery, photos[1], h, selected=True).status_code == 200


def test_nothing_changes_after_expiry(client, s3_buckets):
    gallery, photos = make_gallery(s3_buckets)
    h = authed(client, gallery)
    Gallery.objects.filter(pk=gallery.pk).update(expires_at=timezone.now() - timedelta(minutes=1))
    assert put(client, gallery, photos[0], h, selected=True).status_code == 410
    assert client.post(url(gallery, "/submit"), **h).status_code == 410


# ---- parallel requests ------------------------------------------------------------------------------


@pytest.mark.django_db(transaction=True)
def test_parallel_picks_cannot_pass_the_limit(s3_buckets, monkeypatch):
    monkeypatch.setattr("apps.galleries.tasks.process_photo.apply_async", lambda *a, **k: None)
    gallery = Gallery.objects.create(title="g", status="published", selection_limit=2)
    photos = [
        GalleryPhoto.objects.create(
            gallery=gallery, original_key=f"k{i}", original_filename=f"{i}.jpg", mime="image/jpeg",
            size_bytes=1, sha256=str(i) * 64, status="ready", position=i,
        )
        for i in range(6)
    ]  # fmt: skip
    outcomes: list[str] = []
    barrier = threading.Barrier(6)

    def pick(photo):
        try:
            barrier.wait()
            service.set_selection(gallery, photo.pk, selected=True, comment=None, retouch=None)
            outcomes.append("ok")
        except service.GalleryError as error:
            outcomes.append(error.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=pick, args=(p,)) for p in photos]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert outcomes.count("ok") == 2 and outcomes.count("limit_reached") == 4
    assert Selection.objects.filter(selected=True).count() == 2
