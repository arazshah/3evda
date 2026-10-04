from __future__ import annotations

from typing import Any

from rest_framework import serializers

from apps.core.signed import signed_path

from . import service
from .links import public_url
from .models import DownloadLog, FinalFile, Gallery, GalleryPhoto

PREVIEW_TTL = 300


class GallerySerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    status = serializers.SerializerMethodField()
    has_password = serializers.BooleanField(read_only=True)
    password = serializers.CharField(write_only=True, required=False, allow_blank=True, max_length=128)
    clear_password = serializers.BooleanField(write_only=True, required=False, default=False)
    link = serializers.SerializerMethodField()
    photo_count = serializers.SerializerMethodField()
    ready_count = serializers.SerializerMethodField()
    usage_bytes = serializers.SerializerMethodField()

    class Meta:
        model = Gallery
        fields = [
            "id", "title", "client_name", "language", "status", "has_password", "password", "clear_password",
            "expires_at", "selection_limit", "download_level", "watermark", "note", "inquiry", "booking", "proforma",
            "link", "photo_count", "ready_count", "usage_bytes", "submitted_at", "created_at", "updated_at",
        ]  # fmt: skip
        read_only_fields = ["id", "submitted_at", "created_at", "updated_at"]
        extra_kwargs = {"selection_limit": {"min_value": 1}}

    def get_status(self, obj: Gallery) -> str:
        return service.effective_status(obj)

    def get_link(self, obj: Gallery) -> str:
        return public_url(obj)

    # The list and detail views annotate these in one query; a gallery just made or changed has no annotation yet.
    def get_photo_count(self, obj: Gallery) -> int:
        value = getattr(obj, "photo_count", None)
        return int(value) if value is not None else obj.photos.count()

    def get_ready_count(self, obj: Gallery) -> int:
        value = getattr(obj, "ready_count", None)
        return int(value) if value is not None else obj.photos.filter(status=GalleryPhoto.Status.READY).count()

    def get_usage_bytes(self, obj: Gallery) -> int:
        value = getattr(obj, "usage_bytes", None)
        if value is None:
            return service.usage_bytes(obj)
        return int(value) + service.extra_bytes(obj)  # the annotation counts the photos only

    def _apply_password(self, gallery: Gallery, data: dict[str, Any]) -> None:
        raw = data.pop("password", None)
        clear = data.pop("clear_password", False)
        if clear:
            service.set_password(gallery, "")
        elif raw:
            service.set_password(gallery, raw)

    def create(self, validated_data: dict[str, Any]) -> Gallery:
        raw = validated_data.pop("password", "")
        validated_data.pop("clear_password", None)
        gallery = Gallery(**validated_data)
        service.set_password(gallery, raw)
        gallery.save()
        return gallery

    def update(self, instance: Gallery, validated_data: dict[str, Any]) -> Gallery:
        self._apply_password(instance, validated_data)
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        return instance


class GalleryPhotoSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    thumb_url = serializers.SerializerMethodField()

    class Meta:
        model = GalleryPhoto
        fields = [
            "id",
            "original_filename",
            "status",
            "width",
            "height",
            "size_bytes",
            "position",
            "error",
            "thumb_url",
        ]
        read_only_fields = fields

    def get_thumb_url(self, obj: GalleryPhoto) -> str | None:
        return signed_path(obj.thumb_key, expire=PREVIEW_TTL) if obj.thumb_key else None


class PhotoUploadSerializer(serializers.Serializer):  # type: ignore[type-arg]
    file = serializers.FileField()


class PhotoOrderSerializer(serializers.Serializer):  # type: ignore[type-arg]
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=True)


class FinalFileSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = FinalFile
        fields = ["id", "filename", "mime", "size_bytes", "position", "created_at"]
        read_only_fields = fields


class DownloadLogSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = DownloadLog
        fields = ["id", "kind", "files", "originals", "created_at"]
        read_only_fields = fields


class SelectionItemSerializer(serializers.Serializer):  # type: ignore[type-arg]
    photo = serializers.IntegerField()
    filename = serializers.CharField()
    thumb_url = serializers.CharField(allow_null=True)
    selected = serializers.BooleanField()
    comment = serializers.CharField()
    retouch = serializers.BooleanField()


class SelectionsSerializer(serializers.Serializer):  # type: ignore[type-arg]
    photo_count = serializers.IntegerField()
    selected_count = serializers.IntegerField()
    retouch_count = serializers.IntegerField()
    comment_count = serializers.IntegerField()
    submitted_at = serializers.DateTimeField(allow_null=True)
    filenames = serializers.CharField(help_text="Chosen photos' names without extension, ready for Lightroom's search")
    items = SelectionItemSerializer(many=True)
