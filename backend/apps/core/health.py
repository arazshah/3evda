"""Dependency probes for the readiness endpoint. Each raises on failure."""

from typing import Any

import boto3
import redis
from botocore.config import Config
from django.conf import settings
from django.db import connection


def check_database() -> None:
    with connection.cursor() as cursor:
        cursor.execute("SELECT 1")


def check_redis() -> None:
    client = redis.Redis.from_url(settings.REDIS_URL, socket_timeout=2, socket_connect_timeout=2)
    try:
        client.ping()
    finally:
        client.close()


def s3_client() -> Any:
    return boto3.client(
        "s3",
        endpoint_url=settings.S3_ENDPOINT_URL,
        aws_access_key_id=settings.S3_ACCESS_KEY,
        aws_secret_access_key=settings.S3_SECRET_KEY,
        region_name=settings.S3_REGION,
        config=Config(
            connect_timeout=settings.S3_TIMEOUT_SECONDS,
            read_timeout=settings.S3_TIMEOUT_SECONDS,
            retries={"max_attempts": 1},
        ),
    )


def check_storage() -> None:
    client = s3_client()
    for bucket in (settings.S3_PRIVATE_BUCKET, settings.S3_PUBLIC_BUCKET):
        client.head_bucket(Bucket=bucket)


CHECKS = {
    "database": "check_database",
    "redis": "check_redis",
    "storage": "check_storage",
}
