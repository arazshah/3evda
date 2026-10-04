import io
import json

import pytest
from django.core.management import call_command
from django.core.management.base import CommandError
from django.test import Client

from apps.core.management.commands import drill_data
from apps.galleries.links import make_token
from apps.galleries.models import Gallery, GalleryPhoto

pytestmark = pytest.mark.django_db


@pytest.fixture
def stack(s3_buckets, settings, monkeypatch):
    """A tiny "installation": an admin, a published gallery, one file in each bucket."""
    from django.contrib.auth import get_user_model

    get_user_model().objects.create_user("drill-admin", password="drill-pass-123")
    gallery = Gallery.objects.create(title="گالری تمرین", status="published")
    s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key="galleries/a.jpg", Body=b"private-bytes")
    s3_buckets.put_object(Bucket=settings.S3_PUBLIC_BUCKET, Key="media/b.webp", Body=b"public-bytes")
    monkeypatch.setattr(drill_data, "s3_client", lambda: s3_buckets)
    photo = GalleryPhoto.objects.create(
        gallery=gallery,
        original_key="galleries/a.jpg",
        original_filename="a.jpg",
        mime="image/jpeg",
        size_bytes=1,
        sha256="1" * 64,
        status="ready",
    )
    manifest = {
        "pending_photo": photo.pk,
        "tables": drill_data.table_counts(),
        "objects": drill_data.object_fingerprints(),
        "gallery_token": make_token(gallery),
        "gallery_title": gallery.title,
        "admin_user": "drill-admin",
        "admin_password": "drill-pass-123",
    }
    return manifest, s3_buckets


def verify(manifest, monkeypatch):
    monkeypatch.setattr("sys.stdin", io.StringIO(json.dumps(manifest)))
    call_command("drill_data", "verify")


def test_an_untouched_installation_verifies(stack, monkeypatch, capsys):
    manifest, _ = stack
    verify(manifest, monkeypatch)
    assert "OK:" in capsys.readouterr().out


def test_a_missing_file_fails_the_drill(stack, monkeypatch, settings):
    manifest, s3 = stack
    s3.delete_object(Bucket=settings.S3_PRIVATE_BUCKET, Key="galleries/a.jpg")
    with pytest.raises(CommandError):
        verify(manifest, monkeypatch)


def test_a_changed_file_fails_the_drill(stack, monkeypatch, settings):
    manifest, s3 = stack
    s3.put_object(Bucket=settings.S3_PUBLIC_BUCKET, Key="media/b.webp", Body=b"other")
    with pytest.raises(CommandError):
        verify(manifest, monkeypatch)


def test_a_missing_row_fails_the_drill(stack, monkeypatch):
    manifest, _ = stack
    Gallery.objects.all().delete()
    with pytest.raises(CommandError):
        verify(manifest, monkeypatch)


def test_a_broken_admin_login_fails_the_drill(stack, monkeypatch):
    manifest, _ = stack
    manifest["admin_password"] = "not-the-password"
    with pytest.raises(CommandError):
        verify(manifest, monkeypatch)


def test_the_status_file_is_not_counted_as_data(stack, monkeypatch, settings):
    manifest, s3 = stack
    s3.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key="_system/backup-status.json", Body=b"{}")
    verify(manifest, monkeypatch)  # written by the backup itself; the restore does not bring it back


def test_the_gallery_link_check_uses_the_real_endpoint(stack):
    manifest, _ = stack
    r = Client().get(f"/api/public/galleries/{manifest['gallery_token']}", HTTP_HOST="localhost")
    assert r.status_code == 200 and r.json()["title"] == manifest["gallery_title"]


def test_a_photo_that_was_never_re_queued_fails_the_drill(stack, monkeypatch):
    manifest, _ = stack
    monkeypatch.setattr(drill_data, "READY_TIMEOUT_SECONDS", 0)
    GalleryPhoto.objects.filter(pk=manifest["pending_photo"]).update(status="pending")
    with pytest.raises(CommandError):
        verify(manifest, monkeypatch)
