"""A gallery of 500 photos: the lists, the signed links, the selections and the ZIP stay quick and bounded."""

import io
import os
import time
import zipfile

import pytest
from django.core.cache import cache
from rest_framework.test import APIClient

from apps.galleries import service
from apps.galleries.models import Gallery, GalleryPhoto, Selection, ZipJob
from apps.galleries.tasks import build_zip

pytestmark = pytest.mark.django_db

COUNT = 500
ADMIN = "/api/admin/galleries/"


@pytest.fixture(autouse=True)
def _setup(monkeypatch):
    monkeypatch.setattr("django.db.transaction.on_commit", lambda func, using=None, robust=False: func())
    cache.clear()


PAYLOAD = os.urandom(64 * 1024)


@pytest.fixture
def big(db):
    """A published gallery with 500 ready photos (rows only: the lists never open the files)."""
    gallery = Gallery.objects.create(title="۵۰۰ عکس", status="published", download_level="all_original")
    rows = []
    for i in range(COUNT):
        base = f"galleries/{gallery.public_id.hex}"
        original, preview = f"{base}/originals/{i:04d}.jpg", f"{base}/previews/{i:04d}-preview.webp"
        rows.append(
            GalleryPhoto(
                gallery=gallery,
                status="ready",
                original_key=original,
                thumb_key=f"{base}/previews/{i:04d}-thumb.webp",
                preview_key=preview,
                original_filename=f"IMG_{i:04d}.jpg",
                mime="image/jpeg",
                size_bytes=len(PAYLOAD),
                stored_bytes=len(PAYLOAD),
                sha256=f"{i:064x}",
                width=3000,
                height=2000,
                position=i,
            )
        )
    GalleryPhoto.objects.bulk_create(rows)
    return gallery


def authed(client: APIClient, gallery: Gallery) -> dict[str, str]:
    from apps.galleries.links import make_token

    token = make_token(gallery)
    unlocked = client.post(f"/api/public/galleries/{token}/unlock", {}, format="json")
    assert unlocked.status_code == 200
    return {"HTTP_X_GALLERY_TOKEN": unlocked.data["token"], "link": token}


def test_the_clients_list_of_500_photos_is_one_cheap_request(big, django_assert_max_num_queries):
    client = APIClient()
    h = authed(client, big)
    link = h.pop("link")
    started = time.perf_counter()
    with django_assert_max_num_queries(6):  # the same however many photos
        r = client.get(f"/api/public/galleries/{link}/photos", **h)
    took = time.perf_counter() - started
    assert r.status_code == 200 and len(r.data["photos"]) == COUNT
    assert took < 3, f"{took:.2f}s for the list with {COUNT * 2} signed links"
    first = r.data["photos"][0]
    assert first["thumb_url"].startswith("/storage-signed/") and "X-Amz-Signature" in first["preview_url"]
    assert len({p["preview_url"] for p in r.data["photos"]}) == COUNT  # one link per photo


def test_the_owners_list_and_overview_of_500_photos(owner_client, big, django_assert_max_num_queries):
    started = time.perf_counter()
    with django_assert_max_num_queries(8):
        r = owner_client.get(f"{ADMIN}{big.pk}/photos/")
    assert r.status_code == 200 and len(r.data) == COUNT
    assert time.perf_counter() - started < 3
    chosen = [
        Selection(photo=p, selected=i % 2 == 0, comment="x" if i % 7 == 0 else "")
        for i, p in enumerate(big.photos.all())
    ]
    Selection.objects.bulk_create(chosen)
    started = time.perf_counter()
    with django_assert_max_num_queries(8):
        r = owner_client.get(f"{ADMIN}{big.pk}/selections/")
    assert r.status_code == 200 and r.data["selected_count"] == COUNT // 2
    assert r.data["filenames"].count(",") == COUNT // 2 - 1
    assert time.perf_counter() - started < 3


def test_a_zip_of_500_photos_is_streamed_complete_and_in_time(big, s3_buckets, settings, monkeypatch):
    for photo in big.photos.all():  # only this test needs the files themselves
        s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=photo.original_key, Body=PAYLOAD)
    seen: list[int | None] = []
    real = service.private_storage

    class Watched:
        """Records how much is asked of each file at a time: whole files in one read would not be streaming."""

        def __init__(self, file):
            self._file = file

        def read(self, size=-1):
            seen.append(size)
            return self._file.read(size)

        def __enter__(self):
            self._file.__enter__()
            return self

        def __exit__(self, *exc):
            return self._file.__exit__(*exc)

    class Storage:
        def __init__(self):
            self._real = real()

        def open(self, name, mode="rb"):
            return Watched(self._real.open(name, mode))

        def __getattr__(self, name):
            return getattr(self._real, name)

    monkeypatch.setattr("apps.galleries.tasks.private_storage", lambda: Storage())
    monkeypatch.setattr("apps.galleries.tasks.build_zip.apply_async", lambda *a, **k: None)
    job = service.start_zip(big)
    assert job.total == COUNT and job.originals is True
    started = time.perf_counter()
    assert build_zip.run(job.pk) == "ready"
    took = time.perf_counter() - started
    assert took < 90, f"{took:.1f}s to build a ZIP of {COUNT} photos"
    job = ZipJob.objects.get(pk=job.pk)
    assert (job.status, job.done, job.total) == ("ready", COUNT, COUNT) and job.size_bytes > COUNT * len(PAYLOAD)
    assert seen and all(size is not None and 0 < size <= 1024 * 1024 for size in seen)  # never a whole file at once
    body = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=job.key)["Body"].read()
    archive = zipfile.ZipFile(io.BytesIO(body))
    names = archive.namelist()
    assert len(names) == COUNT == len(set(names)) and names[0] == "IMG_0000.jpg" and names[-1] == "IMG_0499.jpg"
    assert archive.testzip() is None  # every entry's checksum holds
    link = service.zip_link(ZipJob.objects.get(pk=job.pk), "")  # 500 ids checked against the level in one query
    assert "/zips/" in link
