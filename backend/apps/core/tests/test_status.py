import json
from datetime import timedelta

import pytest
from django.utils import timezone

from apps.core import backup, status
from apps.galleries.models import FinalFile, Gallery, GalleryPhoto, ZipJob
from apps.media.models import MediaAsset

pytestmark = pytest.mark.django_db

URL = "/api/admin/system/status"


def by_key(body):
    return {c["key"]: c for c in body["checks"]}


def good_backup(hours_ago=3):
    at = (timezone.now() - timedelta(hours=hours_ago)).isoformat()
    return {"ok": True, "at": at, "last_ok_at": at, "message": "ok", "disk_free_percent": 55.0}


@pytest.fixture
def healthy(monkeypatch, s3_buckets):
    """Database, Redis, storage, worker and the storage disk report fine."""
    monkeypatch.setattr(status.health, "check_redis", lambda: None)
    monkeypatch.setattr(status, "check_worker", lambda: status.Check("worker", "w", "ok", "فعال است."))
    monkeypatch.setattr(status, "storage_free_percent", lambda fetch=None: 62.0)


# ---- who may ask --------------------------------------------------------------------------------------


def test_only_the_signed_in_owner_may_read_it(client):
    assert client.get(URL).status_code in (401, 403)


def test_a_password_only_session_is_not_enough(client, owner_user):
    client.force_login(owner_user)  # no second factor
    assert client.get(URL).status_code in (401, 403)


def test_the_owner_gets_it_uncached(owner_client, healthy):
    r = owner_client.get(URL)
    assert r.status_code == 200
    assert r["Cache-Control"] == "private, no-store"
    body = r.json()
    assert set(body) == {"level", "checked_at", "version", "checks"}


def test_nothing_secret_is_in_the_answer(owner_client, healthy, settings):
    settings.SECRET_KEY = "django-" + "k" * 60  # built here so no secret-looking literal sits in the source
    settings.S3_SECRET_KEY = "storage-" + "s" * 20
    text = owner_client.get(URL).content.decode()
    for secret in (settings.SECRET_KEY, settings.S3_SECRET_KEY, settings.S3_ACCESS_KEY, "RESTIC", "PASSWORD"):
        assert secret not in text


# ---- the cases ------------------------------------------------------------------------------------------


def test_everything_healthy(monkeypatch, healthy):
    body = status.collect(backup_status=good_backup())
    checks = by_key(body)
    assert body["level"] == "ok"
    assert {k: c["level"] for k, c in checks.items() if k != "galleries"} == {
        "database": "ok",
        "redis": "ok",
        "storage": "ok",
        "worker": "ok",
        "queue": "ok",
        "backup": "ok",
        "backup_disk": "ok",
        "storage_disk": "ok",
    }


def test_redis_down_is_an_error(monkeypatch, healthy):
    def down():
        raise ConnectionError("redis down")

    monkeypatch.setattr(status.health, "check_redis", down)
    body = status.collect(backup_status=good_backup())
    assert by_key(body)["redis"]["level"] == "error" and body["level"] == "error"


def test_storage_down_is_an_error(monkeypatch, healthy):
    def down():
        raise RuntimeError("no storage")

    monkeypatch.setattr(status.health, "check_storage", down)
    assert by_key(status.collect(backup_status=good_backup()))["storage"]["level"] == "error"


def test_no_worker_answering_is_an_error(monkeypatch, healthy):
    monkeypatch.undo()  # use the real check; no worker runs in tests
    monkeypatch.setattr(status.health, "check_redis", lambda: None)
    monkeypatch.setattr(status, "storage_free_percent", lambda fetch=None: 62.0)

    class FakeControl:
        @staticmethod
        def ping(timeout):
            return []

    monkeypatch.setattr("config.celery.app.control", FakeControl)
    assert status.check_worker().level == "error"


def test_a_worker_that_answers_is_ok(monkeypatch):
    class FakeControl:
        @staticmethod
        def ping(timeout):
            return [{"celery@w": {"ok": "pong"}}]

    monkeypatch.setattr("config.celery.app.control", FakeControl)
    assert status.check_worker().level == "ok"


def test_a_backup_that_is_too_old_is_red(healthy):
    check = by_key(status.collect(backup_status=good_backup(hours_ago=30)))["backup"]
    assert check["level"] == "error" and "۲۶" in check["detail"]


def test_a_backup_just_inside_26_hours_is_fine(healthy):
    assert by_key(status.collect(backup_status=good_backup(hours_ago=25)))["backup"]["level"] == "ok"


def test_a_failed_backup_is_red_and_says_when_the_last_good_one_was(healthy):
    last_ok = (timezone.now() - timedelta(hours=20)).isoformat()
    failed = {"ok": False, "at": timezone.now().isoformat(), "last_ok_at": last_ok, "message": "dump failed"}
    check = by_key(status.collect(backup_status=failed))["backup"]
    assert check["level"] == "error"
    assert "dump failed" in check["detail"] and "20 ساعت پیش" in check["detail"]


def test_no_backup_yet_is_a_warning_not_an_alarm(healthy):
    body = status.collect(backup_status={})
    assert by_key(body)["backup"]["level"] == "warning" and body["level"] == "warning"


@pytest.mark.parametrize(
    ("free", "level"), [(55, "ok"), (20, "ok"), (19.9, "warning"), (10, "warning"), (9.9, "error")]
)
def test_backup_disk_thresholds(free, level):
    saved = {**good_backup(), "disk_free_percent": free}
    assert status.check_backup_disk(saved).level == level


def test_backup_disk_unknown_before_the_first_run():
    assert status.check_backup_disk(None).level == "unknown"


@pytest.mark.parametrize(("free", "level"), [(62, "ok"), (15, "warning"), (4, "error")])
def test_storage_disk_thresholds(free, level):
    fetch = lambda: {"DiskStatuses": [{"dir": "/data", "percent_free": free}]}  # noqa: E731
    assert status.check_storage_disk(fetch).level == level


def test_storage_disk_takes_the_fullest_disk():
    fetch = lambda: {"DiskStatuses": [{"percent_free": 80}, {"percent_free": 5}]}  # noqa: E731
    assert status.check_storage_disk(fetch).level == "error"


@pytest.mark.parametrize("body", [{}, {"DiskStatuses": []}, {"DiskStatuses": [{"nope": 1}]}])
def test_storage_disk_that_cannot_be_measured_is_unknown_not_an_alarm(body):
    assert status.check_storage_disk(lambda: body).level == "unknown"


def test_storage_disk_unreachable_is_unknown():
    def boom():
        raise OSError("refused")

    assert status.check_storage_disk(boom).level == "unknown"


def test_an_empty_queue_is_ok():
    assert status.check_queue().level == "ok"


@pytest.mark.parametrize(("minutes", "level"), [(5, "ok"), (14, "ok"), (16, "warning"), (59, "warning"), (61, "error")])
def test_the_longest_waiting_job_sets_the_queue_level(minutes, level):
    gallery = Gallery.objects.create(title="g", status="published")
    photo = GalleryPhoto.objects.create(
        gallery=gallery, original_key="a", original_filename="a", mime="image/jpeg", size_bytes=1, sha256="1" * 64
    )
    GalleryPhoto.objects.filter(pk=photo.pk).update(created_at=timezone.now() - timedelta(minutes=minutes))
    assert status.check_queue().level == level


def test_every_kind_of_waiting_work_counts():
    old = timezone.now() - timedelta(hours=3)
    gallery = Gallery.objects.create(title="g", status="published")
    asset = MediaAsset.objects.create(
        kind="image", sha256="a" * 64, original_key="m", original_filename="m", mime="image/jpeg", size_bytes=1
    )
    MediaAsset.objects.filter(pk=asset.pk).update(created_at=old)
    assert status.check_queue().level == "error"
    MediaAsset.objects.all().delete()
    job = ZipJob.objects.create(gallery=gallery)
    ZipJob.objects.filter(pk=job.pk).update(created_at=old)
    assert status.check_queue().level == "error"


def test_finished_work_is_not_waiting():
    gallery = Gallery.objects.create(title="g", status="published")
    photo = GalleryPhoto.objects.create(
        gallery=gallery,
        original_key="a",
        original_filename="a",
        mime="image/jpeg",
        size_bytes=1,
        sha256="1" * 64,
        status="ready",
    )
    GalleryPhoto.objects.filter(pk=photo.pk).update(created_at=timezone.now() - timedelta(days=2))
    assert status.check_queue().level == "ok"


def test_gallery_usage_adds_photos_previews_and_finals():
    gallery = Gallery.objects.create(title="g", status="published")
    GalleryPhoto.objects.create(
        gallery=gallery,
        original_key="a",
        original_filename="a",
        mime="image/jpeg",
        size_bytes=1000,
        stored_bytes=200,
        sha256="1" * 64,
    )
    FinalFile.objects.create(gallery=gallery, key="f", filename="f", mime="image/jpeg", size_bytes=300)
    assert status.gallery_usage() == (1, 1500)
    assert "1 گالری" in status.check_galleries().detail


# ---- the backup writes what the card reads ----------------------------------------------------------


def test_the_last_good_time_survives_a_failed_run(s3_buckets):
    first = backup.BackupStatus(True, "2026-10-03T03:00:00+03:30", "ok")
    backup.write_status(first, s3_buckets)
    second = backup.BackupStatus(False, "2026-10-04T03:00:00+03:30", "broke")
    backup.write_status(second, s3_buckets)
    saved = backup.read_status(s3_buckets)
    assert saved["ok"] is False and saved["last_ok_at"] == "2026-10-03T03:00:00+03:30"


def test_a_good_run_sets_the_last_good_time_to_itself(s3_buckets):
    backup.write_status(backup.BackupStatus(True, "2026-10-04T03:00:00+03:30", "ok"), s3_buckets)
    assert backup.read_status(s3_buckets)["last_ok_at"] == "2026-10-04T03:00:00+03:30"


def test_the_endpoint_reads_the_status_file_the_backup_wrote(owner_client, healthy, s3_buckets, settings):
    backup.write_status(backup.BackupStatus(True, timezone.now().isoformat(), "ok", disk_free_percent=8.0), s3_buckets)
    body = owner_client.get(URL).json()
    assert by_key(body)["backup"]["level"] == "ok"
    assert by_key(body)["backup_disk"]["level"] == "error" and body["level"] == "error"
    json.dumps(body)  # serialisable


# ---- records written before `last_ok_at` existed -----------------------------------------------------


def test_an_old_good_record_counts_its_own_time_as_the_last_good_one(healthy):
    at = (timezone.now() - timedelta(hours=2)).isoformat()
    old = {"ok": True, "at": at, "message": "ok"}  # no last_ok_at
    assert by_key(status.collect(backup_status=old))["backup"]["level"] == "ok"
    assert status.last_good_time(old) is not None


def test_an_old_failed_record_has_no_last_good_time():
    assert status.last_good_time({"ok": False, "at": timezone.now().isoformat()}) is None


def test_a_failure_after_an_old_good_record_keeps_its_time(s3_buckets, settings):
    legacy = {"ok": True, "at": "2026-10-03T03:00:00+03:30", "message": "ok", "snapshot": "x"}
    s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=backup.STATUS_KEY, Body=json.dumps(legacy).encode())
    backup.write_status(backup.BackupStatus(False, "2026-10-04T03:00:00+03:30", "broke"), s3_buckets)
    assert backup.read_status(s3_buckets)["last_ok_at"] == "2026-10-03T03:00:00+03:30"


# ---- unfinished work that was already taken -------------------------------------------------------------


def test_an_archive_that_hangs_while_running_is_counted():
    gallery = Gallery.objects.create(title="g", status="published")
    job = ZipJob.objects.create(gallery=gallery, status=ZipJob.Status.RUNNING)
    ZipJob.objects.filter(pk=job.pk).update(created_at=timezone.now() - timedelta(hours=2))
    assert status.check_queue().level == "error"


def test_a_media_file_stuck_in_processing_is_counted():
    asset = MediaAsset.objects.create(
        kind="image",
        sha256="c" * 64,
        original_key="m",
        original_filename="m",
        mime="image/jpeg",
        size_bytes=1,
        status=MediaAsset.Status.PROCESSING,
    )
    MediaAsset.objects.filter(pk=asset.pk).update(created_at=timezone.now() - timedelta(hours=2))
    assert status.check_queue().level == "error"
