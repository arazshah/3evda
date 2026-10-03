"""Keeps `MediaReference` rows in step with the media foreign keys of a model.

An asset with references cannot be deleted, and the media library shows how often each asset is used.
"""

from typing import Any, ClassVar

from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction

from .models import MediaReference


class MediaRefsMixin(models.Model):
    """Declare `media_fields = ("logo", ...)` (names of foreign keys to `MediaAsset`)."""

    media_fields: ClassVar[tuple[str, ...]] = ()

    class Meta:
        abstract = True

    def save(self, *args: Any, **kwargs: Any) -> None:
        with transaction.atomic():
            super().save(*args, **kwargs)
            self._sync_media_references()

    def delete(self, *args: Any, **kwargs: Any) -> tuple[int, dict[str, int]]:
        with transaction.atomic():
            MediaReference.objects.filter(
                content_type=ContentType.objects.get_for_model(self), object_id=str(self.pk)
            ).delete()
            return super().delete(*args, **kwargs)

    def _sync_media_references(self) -> None:
        content_type = ContentType.objects.get_for_model(self)
        for name in self.media_fields:
            asset_id = getattr(self, f"{name}_id")
            stale = MediaReference.objects.filter(content_type=content_type, object_id=str(self.pk), field=name)
            if asset_id is None:
                stale.delete()
                continue
            stale.exclude(asset_id=asset_id).delete()
            MediaReference.objects.get_or_create(
                asset_id=asset_id, content_type=content_type, object_id=str(self.pk), field=name
            )
