import boto3
import pytest
from django.core.files.base import ContentFile
from moto import mock_aws

from apps.core import health
from apps.core.management.commands.ensure_buckets import ensure_buckets
from apps.core.storage import PrivateStorage, PublicStorage


@pytest.fixture
def s3(settings):
    settings.S3_ENDPOINT_URL = None  # moto intercepts the default AWS endpoint
    with mock_aws():
        yield boto3.client("s3", region_name=settings.S3_REGION)


def test_ensure_buckets_is_idempotent(s3, settings):
    ensure_buckets()
    ensure_buckets()
    names = {b["Name"] for b in s3.list_buckets()["Buckets"]}
    assert names == {settings.S3_PRIVATE_BUCKET, settings.S3_PUBLIC_BUCKET}


def test_private_storage_round_trip_and_presigned_url(s3, settings):
    ensure_buckets()
    storage = PrivateStorage()

    name = storage.save("originals/sample.txt", ContentFile(b"hello"))

    with storage.open(name) as f:
        assert f.read() == b"hello"
    url = storage.url(name)
    assert "X-Amz-Signature=" in url
    assert s3.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=name)["Body"].read() == b"hello"


def test_public_storage_urls_point_at_the_gateway_without_signature(s3, settings):
    ensure_buckets()
    name = PublicStorage().save("variants/a.webp", ContentFile(b"x"))
    assert PublicStorage().url(name) == f"/media/{name}"


def test_storage_health_check_requires_both_buckets(s3):
    with pytest.raises(Exception):
        health.check_storage()
    ensure_buckets()
    health.check_storage()
