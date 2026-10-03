"""Keeps `MediaReference` rows in step with the media foreign keys of a model.

An asset with references cannot be deleted, and the media library shows how often each asset is used.
"""

from typing import Any, ClassVar

from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.db.models.signals import class_prepared, post_delete

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


def _release_references(sender: type[models.Model], instance: models.Model, **kwargs: Any) -> None:
    """post_delete also fires for rows removed by a cascade (e.g. a project's images), unlike `delete()`."""
    MediaReference.objects.filter(
        content_type=ContentType.objects.get_for_model(sender), object_id=str(instance.pk)
    ).delete()


def _connect(sender: type[models.Model], **kwargs: Any) -> None:
    if issubclass(sender, MediaRefsMixin) and not sender._meta.abstract:
        post_delete.connect(_release_references, sender=sender, dispatch_uid=f"media-refs-{sender._meta.label}")


class_prepared.connect(_connect)
