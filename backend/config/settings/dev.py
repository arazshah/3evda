import os

os.environ.setdefault("DJANGO_SECRET_KEY", "dev-only-insecure-key-never-used-in-production-000000")
os.environ.setdefault("POSTGRES_DB", "threevda")
os.environ.setdefault("POSTGRES_USER", "threevda")
os.environ.setdefault("POSTGRES_PASSWORD", "threevda")
os.environ.setdefault("POSTGRES_HOST", "localhost")
os.environ.setdefault("REDIS_URL", "redis://localhost:6379/0")
os.environ.setdefault("S3_ENDPOINT_URL", "http://localhost:8333")
os.environ.setdefault("S3_ACCESS_KEY", "dev-access-key")
os.environ.setdefault("S3_SECRET_KEY", "dev-secret-key")

from .base import *  # noqa: F403

DEBUG = True
ALLOW_DEMO_DATA = True
ALLOWED_HOSTS = ["*"]
