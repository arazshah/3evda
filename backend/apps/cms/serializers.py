from typing import Any

from rest_framework import serializers

from apps.media.models import MediaAsset
from apps.media.serializers import MediaVariantSerializer

from .blocks import BY_KEY
from .models import ContentBlock, ContentItem, SiteSettings

MEDIA_NOT_READY = "این فایل پیدا نشد یا هنوز پردازش نشده است."


class PublicMediaSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    """What a visitor may know about a file: sizes, alt texts and the public variant URLs."""

    variants = MediaVariantSerializer(many=True, read_only=True)

    class Meta:
        model = MediaAsset
        fields = ["id", "kind", "width", "height", "duration_seconds", "alt_fa", "alt_en", "lqip", "variants"]
        read_only_fields = fields


def ready_media_field() -> "serializers.PrimaryKeyRelatedField[MediaAsset]":
    return serializers.PrimaryKeyRelatedField(
        queryset=MediaAsset.objects.filter(status=MediaAsset.Status.READY),
        allow_null=True,
        required=False,
        error_messages={"does_not_exist": MEDIA_NOT_READY},
    )


# ---- visitors (read-only) --------------------------------------------------------------------------


class PublicSettingsSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    logo = PublicMediaSerializer(read_only=True, allow_null=True)
    og_image = PublicMediaSerializer(read_only=True, allow_null=True)

    class Meta:
        model = SiteSettings
        exclude = ["id", "updated_at"]
        read_only_fields = [f.name for f in SiteSettings._meta.get_fields()]


class PublicBlockSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    fa = serializers.CharField(source="text_fa", read_only=True)
    en = serializers.CharField(source="text_en", read_only=True)
    media = PublicMediaSerializer(read_only=True, allow_null=True)

    class Meta:
        model = ContentBlock
        fields = ["fa", "en", "media"]


class PublicItemSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    media = PublicMediaSerializer(read_only=True, allow_null=True)

    class Meta:
        model = ContentItem
        fields = [
            "id", "title_fa", "title_en", "subtitle_fa", "subtitle_en", "body_fa", "body_en", "link_url", "media",
        ]  # fmt: skip
        read_only_fields = fields


class PublicCollectionsSerializer(serializers.Serializer):  # type: ignore[type-arg]
    hero_slide = PublicItemSerializer(many=True)
    service = PublicItemSerializer(many=True)
    process_step = PublicItemSerializer(many=True)
    client = PublicItemSerializer(many=True)
    testimonial = PublicItemSerializer(many=True)
    behind_scenes = PublicItemSerializer(many=True)
    faq = PublicItemSerializer(many=True)
    nav_link = PublicItemSerializer(many=True)


class PublicSiteSerializer(serializers.Serializer):  # type: ignore[type-arg]
    settings = PublicSettingsSerializer()
    blocks = serializers.DictField(child=PublicBlockSerializer())
    collections = PublicCollectionsSerializer()


# ---- the owner -------------------------------------------------------------------------------------


class SiteSettingsSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    logo = ready_media_field()
    og_image = ready_media_field()
    logo_detail = PublicMediaSerializer(source="logo", read_only=True, allow_null=True)
    og_image_detail = PublicMediaSerializer(source="og_image", read_only=True, allow_null=True)

    class Meta:
        model = SiteSettings
        exclude = ["id"]
        read_only_fields = ["updated_at"]


class ContentBlockSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    media = ready_media_field()
    media_detail = PublicMediaSerializer(source="media", read_only=True, allow_null=True)
    display_name = serializers.SerializerMethodField()
    group = serializers.SerializerMethodField()
    kind = serializers.SerializerMethodField()

    class Meta:
        model = ContentBlock
        fields = ["key", "display_name", "group", "kind", "text_fa", "text_en", "media", "media_detail", "updated_at"]
        read_only_fields = ["key", "updated_at"]

    def get_display_name(self, obj: ContentBlock) -> str:
        return BY_KEY[obj.key].label if obj.key in BY_KEY else obj.key

    def get_group(self, obj: ContentBlock) -> str:
        return BY_KEY[obj.key].group if obj.key in BY_KEY else ""

    def get_kind(self, obj: ContentBlock) -> str:
        return BY_KEY[obj.key].kind if obj.key in BY_KEY else "text"


class ContentItemSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    media = ready_media_field()
    media_detail = PublicMediaSerializer(source="media", read_only=True, allow_null=True)

    class Meta:
        model = ContentItem
        fields = [
            "id", "collection", "position", "is_published", "title_fa", "title_en", "subtitle_fa", "subtitle_en",
            "body_fa", "body_en", "link_url", "media", "media_detail", "created_at", "updated_at",
        ]  # fmt: skip
        read_only_fields = ["id", "position", "created_at", "updated_at"]

    def validate_collection(self, value: str) -> str:
        if self.instance is not None and value != self.instance.collection:
            raise serializers.ValidationError("نوع آیتم بعد از ساخت قابل تغییر نیست.")
        return value

    def validate_link_url(self, value: str) -> str:
        if value and not (value.startswith("/") or value.startswith(("https://", "http://"))):
            raise serializers.ValidationError("پیوند باید با / یا https:// شروع شود.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        merged = {**{f: getattr(self.instance, f, "") for f in ("title_fa", "title_en", "body_fa", "body_en")}, **attrs}
        has_text = any(merged.get(f) for f in ("title_fa", "title_en", "body_fa", "body_en"))
        if "media" in attrs:  # an explicit null replaces the stored image
            has_media = attrs["media"] is not None
        else:
            has_media = self.instance is not None and self.instance.media_id is not None
        if not (has_text or has_media):
            raise serializers.ValidationError("حداقل یک عنوان، متن یا تصویر لازم است.")
        return attrs


class ReorderSerializer(serializers.Serializer):  # type: ignore[type-arg]
    collection = serializers.ChoiceField(choices=ContentItem.Collection.choices)
    ids = serializers.ListField(child=serializers.IntegerField(), allow_empty=False)
