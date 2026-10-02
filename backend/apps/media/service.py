from __future__ import annotations

import hashlib
import uuid
from typing import Any

from django.core.files.base import ContentFile
from django.core.files.uploadedfile import UploadedFile
from django.db import IntegrityError, transaction

from .images import Rendition
from .models import MediaAsset, MediaVariant
from .storage import private_storage, public_storage
from .validation import inspect_upload


def _sha256(upload: UploadedFile[bytes]) -> str:
    digest = hashlib.sha256()
    upload.seek(0)
    for chunk in upload.chunks():
        digest.update(chunk)
    upload.seek(0)
    return digest.hexdigest()


def create_asset(upload: UploadedFile[bytes], user: Any) -> tuple[MediaAsset, bool]:
    """Validate and store an upload. Returns (asset, created); identical files are not stored twice."""
    from .tasks import process_asset

    info = inspect_upload(upload)
    checksum = _sha256(upload)
    existing = MediaAsset.objects.filter(sha256=checksum).first()
    if existing is not None:
        return existing, False

    asset_id = uuid.uuid4()
    storage = private_storage()
    key = storage.save(f"originals/{asset_id}{info.ext}", upload)
    try:
        with transaction.atomic():
            asset = MediaAsset.objects.create(
                id=asset_id,
                kind=info.kind,
                original_key=key,
                original_filename=(upload.name or "upload")[:255],
                mime=info.mime,
                size_bytes=info.size,
                sha256=checksum,
                width=info.width,
                height=info.height,
                uploaded_by=user if getattr(user, "is_authenticated", False) else None,
            )
            transaction.on_commit(lambda: process_asset.delay(str(asset.pk)))
    except IntegrityError:
        storage.delete(key)  # a concurrent upload of the same file won the race
        return MediaAsset.objects.get(sha256=checksum), False
    except Exception:
        storage.delete(key)
        raise
    return asset, True


def store_renditions(asset: MediaAsset, items: list[Rendition], extra: list[MediaVariant] | None = None) -> None:
    """Upload new variants, swap the database rows atomically, then delete the old objects."""
    storage = public_storage()
    new: list[MediaVariant] = []
    for item in items:
        digest = hashlib.sha256(item.data).hexdigest()[:12]
        key = f"variants/{asset.pk}/{item.name}-{digest}.{item.format}"
        if not storage.exists(key):
            storage.save(key, ContentFile(item.data))
        new.append(MediaVariant(asset=asset, name=item.name, format=item.format, key=key,
                                width=item.width, height=item.height, size_bytes=len(item.data)))  # fmt: skip
    new.extend(extra or [])
    new_keys = {v.key for v in new}
    old_keys = set(asset.variants.values_list("key", flat=True)) - new_keys
    with transaction.atomic():
        asset.variants.all().delete()
        MediaVariant.objects.bulk_create(new)
        transaction.on_commit(lambda: [storage.delete(k) for k in old_keys])


def delete_asset(asset: MediaAsset) -> None:
    keys = list(asset.variants.values_list("key", flat=True))
    original = asset.original_key
    with transaction.atomic():
        asset.delete()  # raises ProtectedError while references exist

        def cleanup() -> None:
            for key in keys:
                public_storage().delete(key)
            private_storage().delete(original)

        transaction.on_commit(cleanup)
