from typing import Any

from django.db import transaction
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.core.slugs import unique_slug
from apps.media.serializers import PublicMediaSerializer, ready_media_field

from .models import Category, Project, ProjectImage

# ---- visitors --------------------------------------------------------------------------------------


class PublicCategorySerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    cover = PublicMediaSerializer(read_only=True, allow_null=True)
    project_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["slug", "title_fa", "title_en", "description_fa", "description_en", "cover", "project_count"]
        read_only_fields = fields


class PublicImageSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    media = PublicMediaSerializer(read_only=True)

    class Meta:
        model = ProjectImage
        fields = ["media", "caption_fa", "caption_en"]
        read_only_fields = fields


class PublicProjectSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    category: serializers.SlugRelatedField = serializers.SlugRelatedField(slug_field="slug", read_only=True)  # type: ignore[type-arg]
    cover = serializers.SerializerMethodField()

    class Meta:
        model = Project
        fields = [
            "slug", "category", "style", "title_fa", "title_en", "summary_fa", "summary_en", "client_fa",
            "client_en", "year", "is_featured", "cover",
        ]  # fmt: skip
        read_only_fields = fields

    @extend_schema_field(PublicMediaSerializer(allow_null=True))
    def get_cover(self, obj: Project) -> Any:
        """The chosen cover, else the first image of the project."""
        media = obj.cover or next((i.media for i in obj.images.all()), None)
        return PublicMediaSerializer(media).data if media else None


class PublicProjectDetailSerializer(PublicProjectSerializer):
    images = PublicImageSerializer(many=True, read_only=True)
    previous = serializers.CharField(read_only=True, allow_null=True)
    next = serializers.CharField(read_only=True, allow_null=True)

    class Meta(PublicProjectSerializer.Meta):
        fields = [*PublicProjectSerializer.Meta.fields, "body_fa", "body_en", "images", "previous", "next"]
        read_only_fields = fields


class PublicPortfolioSerializer(serializers.Serializer):  # type: ignore[type-arg]
    categories = PublicCategorySerializer(many=True)
    projects = PublicProjectSerializer(many=True)


# ---- the owner -------------------------------------------------------------------------------------


class SlugMixin:
    """`slug` may be left empty: it is then made from the English (or Persian) title."""

    def _slug_for(self, attrs: dict[str, Any], instance: Any) -> str:
        model = self.Meta.model  # type: ignore[attr-defined]
        return unique_slug(
            model,
            attrs.get("title_en", getattr(instance, "title_en", "")),
            fallback=model._meta.model_name,
            exclude_pk=instance.pk if instance else None,
        )


class CategorySerializer(SlugMixin, serializers.ModelSerializer):  # type: ignore[type-arg]
    cover = ready_media_field()
    cover_detail = PublicMediaSerializer(source="cover", read_only=True, allow_null=True)
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True)
    project_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = [
            "id", "slug", "title_fa", "title_en", "description_fa", "description_en", "cover", "cover_detail",
            "position", "is_published", "project_count",
        ]  # fmt: skip
        read_only_fields = ["id", "position", "project_count"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("slug") and (self.instance is None or "slug" in attrs):
            attrs["slug"] = self._slug_for(attrs, self.instance)
        return attrs


class ProjectImageSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    media = ready_media_field(required=True)
    media_detail = PublicMediaSerializer(source="media", read_only=True)

    class Meta:
        model = ProjectImage
        fields = ["media", "media_detail", "caption_fa", "caption_en"]


class ProjectSerializer(SlugMixin, serializers.ModelSerializer):  # type: ignore[type-arg]
    cover = ready_media_field()
    cover_detail = PublicMediaSerializer(source="cover", read_only=True, allow_null=True)
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True)
    images = ProjectImageSerializer(many=True, required=False)

    class Meta:
        model = Project
        fields = [
            "id", "slug", "category", "style", "title_fa", "title_en", "summary_fa", "summary_en", "body_fa",
            "body_en", "client_fa", "client_en", "year", "cover", "cover_detail", "is_featured", "is_published",
            "position", "images", "created_at", "updated_at",
        ]  # fmt: skip
        read_only_fields = ["id", "position", "created_at", "updated_at"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not attrs.get("slug") and (self.instance is None or "slug" in attrs):
            attrs["slug"] = self._slug_for(attrs, self.instance)
        return attrs

    @staticmethod
    def _replace_images(project: Project, images: list[dict[str, Any]]) -> None:
        for old in project.images.all():
            old.delete()  # one by one so the media references are released
        for position, data in enumerate(images):
            ProjectImage.objects.create(project=project, position=position, **data)

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Project:
        images = validated_data.pop("images", [])
        project: Project = super().create(validated_data)
        self._replace_images(project, images)
        return project

    @transaction.atomic
    def update(self, instance: Project, validated_data: dict[str, Any]) -> Project:
        images = validated_data.pop("images", None)
        project: Project = super().update(instance, validated_data)
        if images is not None:
            self._replace_images(project, images)
        return project
