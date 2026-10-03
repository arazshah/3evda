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
