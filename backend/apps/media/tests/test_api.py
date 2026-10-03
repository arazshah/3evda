from urllib.parse import parse_qs, urlsplit

import pytest
from django.contrib.contenttypes.models import ContentType
from django.core.files.uploadedfile import SimpleUploadedFile

from apps.audit.models import AuditLog
from apps.media.models import MediaAsset, MediaReference, WatermarkSetting
from apps.media.service import create_asset

from .factories import image_bytes

pytestmark = pytest.mark.django_db


def upload(client, data: bytes, name: str = "photo.jpg"):  # type: ignore[no-untyped-def]
    return client.post("/api/admin/media/", {"file": SimpleUploadedFile(name, data)}, format="multipart")


def test_upload_creates_an_asset_and_queues_processing(owner_client, s3_buckets, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        response = upload(owner_client, image_bytes("JPEG", size=(1600, 1000)))

    assert response.status_code == 201, response.content
    body = response.json()
    assert body["kind"] == "image"
    assert body["original_filename"] == "photo.jpg"
    asset = MediaAsset.objects.get(pk=body["id"])
    assert asset.status == MediaAsset.Status.READY  # eager Celery in tests
    assert AuditLog.objects.filter(action="media.upload", target_id=str(asset.pk)).exists()


def test_duplicate_upload_returns_200_with_the_existing_asset(owner_client, s3_buckets):
    data = image_bytes("JPEG")
    first = upload(owner_client, data).json()
    response = upload(owner_client, data, "again.jpg")
    assert response.status_code == 200
    assert response.json()["id"] == first["id"]


def test_rejected_upload_explains_why_in_persian(owner_client, s3_buckets):
    response = upload(owner_client, b"<svg><script>alert(1)</script></svg>", "x.svg")
    assert response.status_code == 400
    assert response.json()["code"] == "unsupported_type"
    assert "پشتیبانی" in response.json()["detail"]
    assert not MediaAsset.objects.exists()


def test_upload_without_a_file_is_rejected(owner_client, s3_buckets):
    response = owner_client.post("/api/admin/media/", {}, format="multipart")
    assert response.status_code == 400


def test_list_search_and_filters(owner_client, s3_buckets):
    a, _ = create_asset(SimpleUploadedFile("pistachio.jpg", image_bytes("JPEG", color="#111")), user=None)
    b, _ = create_asset(SimpleUploadedFile("tea.png", image_bytes("PNG", color="#222")), user=None)
    MediaAsset.objects.filter(pk=b.pk).update(alt_fa="چای ایرانی")

    body = owner_client.get("/api/admin/media/").json()
    assert body["count"] == 2
    assert {r["id"] for r in body["results"]} == {str(a.pk), str(b.pk)}

    assert [r["id"] for r in owner_client.get("/api/admin/media/?q=pista").json()["results"]] == [str(a.pk)]
    assert [r["id"] for r in owner_client.get("/api/admin/media/?q=چای").json()["results"]] == [str(b.pk)]
    assert owner_client.get("/api/admin/media/?kind=video").json()["count"] == 0
    assert owner_client.get("/api/admin/media/?status=pending").json()["count"] == 2


def test_edit_alt_texts_and_title(owner_client, s3_buckets):
    asset, _ = create_asset(SimpleUploadedFile("a.jpg", image_bytes("JPEG")), user=None)
    response = owner_client.patch(
        f"/api/admin/media/{asset.pk}/",
        {"title": "پسته", "alt_fa": "پسته در کاسه‌ی مسی", "alt_en": "Pistachios in a copper bowl", "kind": "video"},
        format="json",
    )
    assert response.status_code == 200
    asset.refresh_from_db()
    assert (asset.title, asset.alt_fa, asset.alt_en) == ("پسته", "پسته در کاسه‌ی مسی", "Pistachios in a copper bowl")
    assert asset.kind == "image"  # read-only fields are ignored
    assert AuditLog.objects.filter(action="media.update").exists()


def test_put_is_not_allowed(owner_client, s3_buckets):
    asset, _ = create_asset(SimpleUploadedFile("a.jpg", image_bytes("JPEG")), user=None)
    assert owner_client.put(f"/api/admin/media/{asset.pk}/", {}, format="json").status_code == 405


def test_delete_removes_the_asset_and_its_files(owner_client, s3_buckets, settings, django_capture_on_commit_callbacks):
    with django_capture_on_commit_callbacks(execute=True):
        asset_id = upload(owner_client, image_bytes("JPEG")).json()["id"]
    with django_capture_on_commit_callbacks(execute=True):
        response = owner_client.delete(f"/api/admin/media/{asset_id}/")

    assert response.status_code == 204
    assert not MediaAsset.objects.exists()
    for bucket in (settings.S3_PRIVATE_BUCKET, settings.S3_PUBLIC_BUCKET):
        assert s3_buckets.list_objects_v2(Bucket=bucket).get("KeyCount", 0) == 0
    assert AuditLog.objects.filter(action="media.delete").exists()


def test_assets_in_use_cannot_be_deleted(owner_client, s3_buckets, owner_user):
    asset, _ = create_asset(SimpleUploadedFile("a.jpg", image_bytes("JPEG")), user=None)
    MediaReference.objects.create(
        asset=asset,
        content_type=ContentType.objects.get_for_model(owner_user),
        object_id=str(owner_user.pk),
        field="avatar",
    )
    response = owner_client.delete(f"/api/admin/media/{asset.pk}/")
    assert response.status_code == 409
    assert response.json()["code"] == "in_use"
    assert MediaAsset.objects.filter(pk=asset.pk).exists()
    assert owner_client.get(f"/api/admin/media/{asset.pk}/").json()["usage_count"] == 1


def test_original_download_redirects_to_a_short_lived_signed_gateway_path(owner_client, s3_buckets, settings):
    asset, _ = create_asset(SimpleUploadedFile("سفارش ۱.jpg", image_bytes("JPEG")), user=None)
    response = owner_client.get(f"/api/admin/media/{asset.pk}/original/")

    assert response.status_code == 302
    assert response["Cache-Control"] == "no-store"
    assert response["Referrer-Policy"] == "no-referrer"
    target = urlsplit(response["Location"])
    assert not target.scheme and not target.netloc  # same origin; the storage host is never exposed
    assert target.path == f"/storage-signed/{settings.S3_PRIVATE_BUCKET}/{asset.original_key}"
    query = parse_qs(target.query)
    assert "X-Amz-Signature" in query
    assert int(query["X-Amz-Expires"][0]) <= 60
    assert "attachment" in query["response-content-disposition"][0]
    assert AuditLog.objects.filter(action="media.download_original").exists()


def test_reprocess(owner_client, s3_buckets, django_capture_on_commit_callbacks):
    asset, _ = create_asset(SimpleUploadedFile("a.jpg", image_bytes("JPEG")), user=None)
    with django_capture_on_commit_callbacks(execute=True):
        response = owner_client.post(f"/api/admin/media/{asset.pk}/reprocess/")
    assert response.status_code == 202
    asset.refresh_from_db()
    assert asset.status == MediaAsset.Status.READY


def test_watermark_settings_round_trip(owner_client):
    assert owner_client.get("/api/admin/settings/watermark").json()["enabled"] is False
    response = owner_client.put(
        "/api/admin/settings/watermark",
        {"enabled": True, "text": "© سودا رحیم‌پور", "opacity": 0.5, "position": "center", "size_ratio": 0.05},
        format="json",
    )
    assert response.status_code == 200, response.content
    setting = WatermarkSetting.load()
    assert setting.enabled and setting.text == "© سودا رحیم‌پور" and setting.position == "center"
    assert AuditLog.objects.filter(action="settings.watermark").exists()


def test_watermark_settings_are_validated(owner_client):
    response = owner_client.put(
        "/api/admin/settings/watermark",
        {"enabled": True, "text": "x", "opacity": 7, "position": "nowhere", "size_ratio": 0.05},
        format="json",
    )
    assert response.status_code == 400
    assert set(response.json()["fields"]) == {"opacity", "position"}
