from rest_framework import serializers

from .models import MediaAsset, MediaVariant, WatermarkSetting


class MediaVariantSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    url = serializers.CharField(read_only=True)

    class Meta:
        model = MediaVariant
        fields = ["name", "format", "url", "width", "height", "size_bytes"]


class MediaAssetSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    variants = MediaVariantSerializer(many=True, read_only=True)
    usage_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = MediaAsset
        fields = [
            "id", "kind", "status", "original_filename", "mime", "size_bytes", "width", "height",
            "duration_seconds", "title", "alt_fa", "alt_en", "lqip", "watermarked", "error", "usage_count",
            "variants", "created_at", "updated_at",
        ]  # fmt: skip
        read_only_fields = [f for f in fields if f not in ("title", "alt_fa", "alt_en")]


class MediaUploadSerializer(serializers.Serializer):  # type: ignore[type-arg]
    file = serializers.FileField(allow_empty_file=True)


class WatermarkSettingSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = WatermarkSetting
        fields = ["enabled", "text", "opacity", "position", "size_ratio", "updated_at"]
        read_only_fields = ["updated_at"]


MEDIA_NOT_READY = "این فایل پیدا نشد یا هنوز پردازش نشده است."


class PublicMediaSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    """What a visitor may know about a file: sizes, alt texts and the public variant URLs."""

    variants = MediaVariantSerializer(many=True, read_only=True)

    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "width", "height", "duration_seconds", "alt_fa", "alt_en", "lqip", "variants"]
        read_only_fields = fields


def ready_media_field(*, required: bool = False) -> "serializers.PrimaryKeyRelatedField[MediaAsset]":
    """A writable reference to a finished media asset (the owner picks it from the library).

    Optional fields accept null (clears the image); a required one rejects it.
    """
    return serializers.PrimaryKeyRelatedField(
        queryset=MediaAsset.objects.filter(status=MediaAsset.Status.READY),
        allow_null=not required,
        required=required,
        error_messages={"does_not_exist": MEDIA_NOT_READY},
    )
