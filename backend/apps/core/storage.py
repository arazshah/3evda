from typing import Any

from django.conf import settings
from storages.backends.s3 import S3Storage
from storages.utils import clean_name


def _common() -> dict[str, Any]:
    return {
        "endpoint_url": settings.S3_ENDPOINT_URL,
        "access_key": settings.S3_ACCESS_KEY,
        "secret_key": settings.S3_SECRET_KEY,
        "region_name": settings.S3_REGION,
        "signature_version": "s3v4",
        "addressing_style": "path",
        "file_overwrite": False,
        "default_acl": None,
    }


class PrivateStorage(S3Storage):  # type: ignore[misc]
    """Originals, client deliveries and archives. Accessed only via short-lived signed URLs."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(
            **{**_common(), "bucket_name": settings.S3_PRIVATE_BUCKET, "querystring_expire": 300, **kwargs}
        )


class PublicStorage(S3Storage):  # type: ignore[misc]
    """Derived web variants, served by the gateway under /media/."""

    def __init__(self, **kwargs: Any) -> None:
        super().__init__(**{**_common(), "bucket_name": settings.S3_PUBLIC_BUCKET, "querystring_auth": False, **kwargs})

    def url(self, name: str, parameters: Any = None, expire: Any = None, http_method: Any = None) -> str:
        return f"/media/{clean_name(name)}"
