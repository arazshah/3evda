from functools import lru_cache

from django.conf import settings

from apps.core.storage import PrivateStorage, PublicStorage


def _settings_key() -> tuple[object, ...]:
    return (
        settings.S3_ENDPOINT_URL,
        settings.S3_ACCESS_KEY,
        settings.S3_SECRET_KEY,
        settings.S3_REGION,
        settings.S3_PRIVATE_BUCKET,
        settings.S3_PUBLIC_BUCKET,
    )


# A storage object holds its connection (one per thread). Making a new one for every call costs about a tenth of a
# second, which signing the links of a 500-photo gallery turned into minutes. One per set of settings is enough.
@lru_cache(maxsize=8)
def _private(key: tuple[object, ...]) -> PrivateStorage:
    return PrivateStorage()


@lru_cache(maxsize=8)
def _public(key: tuple[object, ...]) -> PublicStorage:
    return PublicStorage()


def private_storage() -> PrivateStorage:
    return _private(_settings_key())


def public_storage() -> PublicStorage:
    return _public(_settings_key())
