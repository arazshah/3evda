from __future__ import annotations

from rest_framework import serializers

from .models import Gallery, Selection


class PublicGallerySerializer(serializers.Serializer):  # type: ignore[type-arg]
    title = serializers.CharField()
    client_name = serializers.CharField()
    language = serializers.CharField()
    status = serializers.CharField(help_text="published, submitted or expired")
    has_password = serializers.BooleanField()
    selection_limit = serializers.IntegerField(allow_null=True)
    download_level = serializers.ChoiceField(choices=Gallery.DownloadLevel.choices)
    submitted = serializers.BooleanField()


class UnlockRequestSerializer(serializers.Serializer):  # type: ignore[type-arg]
    password = serializers.CharField(required=False, allow_blank=True, max_length=128)


class UnlockResponseSerializer(serializers.Serializer):  # type: ignore[type-arg]
    token = serializers.CharField()
    expires_in = serializers.IntegerField()


class PublicPhotoSerializer(serializers.Serializer):  # type: ignore[type-arg]
    id = serializers.IntegerField()
    name = serializers.CharField()
    width = serializers.IntegerField(allow_null=True)
    height = serializers.IntegerField(allow_null=True)
    thumb_url = serializers.CharField()
    preview_url = serializers.CharField()
    selected = serializers.BooleanField()
    comment = serializers.CharField()
    retouch = serializers.BooleanField()


class PublicPhotosSerializer(serializers.Serializer):  # type: ignore[type-arg]
    selection_limit = serializers.IntegerField(allow_null=True)
    selected_count = serializers.IntegerField()
    submitted = serializers.BooleanField()
    photos = PublicPhotoSerializer(many=True)


class SelectionRequestSerializer(serializers.Serializer):  # type: ignore[type-arg]
    selected = serializers.BooleanField(required=False)
    comment = serializers.CharField(required=False, allow_blank=True, max_length=Selection.COMMENT_MAX)
    retouch = serializers.BooleanField(required=False)


class SelectionSerializer(serializers.Serializer):  # type: ignore[type-arg]
    selected = serializers.BooleanField()
    comment = serializers.CharField()
    retouch = serializers.BooleanField()
    selected_count = serializers.IntegerField()


class SubmitResponseSerializer(serializers.Serializer):  # type: ignore[type-arg]
    submitted = serializers.BooleanField()
    selected_count = serializers.IntegerField()
