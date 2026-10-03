from typing import Any

from django.core import signing
from django.db import transaction
from django.utils import timezone
from drf_spectacular.utils import extend_schema_field
from rest_framework import serializers

from apps.media.models import MediaAsset
from apps.media.serializers import PublicMediaSerializer, ready_media_field
from apps.portfolio.models import Project
from apps.portfolio.serializers import PublicProjectSerializer

from . import service
from .body import BodyError, clean_doc, media_ids, reading_minutes, render_html
from .models import Article, Category, Language, Tag

PREVIEW_SALT = "blog-preview"
PREVIEW_MAX_AGE = 24 * 60 * 60


def preview_token(article: Article) -> str:
    return signing.dumps({"article": article.pk}, salt=PREVIEW_SALT)


def article_from_token(token: str) -> Article | None:
    try:
        data = signing.loads(token, salt=PREVIEW_SALT, max_age=PREVIEW_MAX_AGE)
    except signing.BadSignature:
        return None
    return Article.objects.filter(pk=data.get("article")).first()


# ---- public ----------------------------------------------------------------------------------------


class PublicBlogCategorySerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = Category
        fields = ["slug", "title_fa", "title_en"]
        read_only_fields = fields


class PublicBlogTagSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = Tag
        fields = ["slug", "title_fa", "title_en"]
        read_only_fields = fields


class PublicBlogArticleSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    cover = PublicMediaSerializer(read_only=True, allow_null=True)
    category = PublicBlogCategorySerializer(read_only=True, allow_null=True)
    tags = PublicBlogTagSerializer(many=True, read_only=True)

    class Meta:
        model = Article
        fields = [
            "language",
            "slug",
            "title",
            "summary",
            "cover",
            "category",
            "tags",
            "reading_minutes",
            "published_at",
        ]
        read_only_fields = fields


class AlternateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    language = serializers.CharField()
    slug = serializers.CharField()


class PublicBlogArticleDetailSerializer(PublicBlogArticleSerializer):
    body_html = serializers.SerializerMethodField()
    seo_title = serializers.SerializerMethodField()
    seo_description = serializers.SerializerMethodField()
    og_image = serializers.SerializerMethodField()
    alternates = serializers.SerializerMethodField()
    related_articles = serializers.SerializerMethodField()
    related_projects = serializers.SerializerMethodField()
    previous = serializers.CharField(read_only=True, allow_null=True)
    next = serializers.CharField(read_only=True, allow_null=True)

    class Meta(PublicBlogArticleSerializer.Meta):
        fields = [
            *PublicBlogArticleSerializer.Meta.fields,
            "body_html", "seo_title", "seo_description", "og_image", "alternates", "related_articles",
            "related_projects", "previous", "next",
        ]  # fmt: skip
        read_only_fields = fields

    def get_body_html(self, obj: Article) -> str:
        ids = media_ids(obj.body) if isinstance(obj.body, dict) else []
        assets = MediaAsset.objects.filter(pk__in=ids, status=MediaAsset.Status.READY).prefetch_related("variants")
        media = {str(a.pk): dict(PublicMediaSerializer(a).data) for a in assets}
        return render_html(obj.body if isinstance(obj.body, dict) else {}, media, obj.language)

    def get_seo_title(self, obj: Article) -> str:
        return obj.seo_title or obj.title

    def get_seo_description(self, obj: Article) -> str:
        return obj.seo_description or obj.summary

    @extend_schema_field(PublicMediaSerializer(allow_null=True))
    def get_og_image(self, obj: Article) -> Any:
        media = obj.og_image or obj.cover
        return PublicMediaSerializer(media).data if media else None

    @extend_schema_field(AlternateSerializer(many=True))
    def get_alternates(self, obj: Article) -> Any:
        """The other-language versions that visitors can actually open."""
        others = Article.objects.visible().filter(translation_group=obj.translation_group).exclude(pk=obj.pk)
        return [{"language": a.language, "slug": a.slug} for a in others]

    @extend_schema_field(PublicBlogArticleSerializer(many=True))
    def get_related_articles(self, obj: Article) -> Any:
        from django.db.models import Q

        qs = Article.objects.visible().filter(language=obj.language).exclude(pk=obj.pk)
        tag_ids = list(obj.tags.values_list("pk", flat=True))
        shares = Q()
        if obj.category_id is not None:  # `category_id=None` would match every uncategorised article
            shares |= Q(category_id=obj.category_id)
        if tag_ids:
            shares |= Q(tags__in=tag_ids)
        if shares:
            qs = qs.filter(shares).distinct()
        related = qs.select_related("category", "cover").prefetch_related("tags", "cover__variants")[:3]
        return PublicBlogArticleSerializer(related, many=True).data

    @extend_schema_field(PublicProjectSerializer(many=True))
    def get_related_projects(self, obj: Article) -> Any:
        from apps.portfolio.views import visible_projects

        projects = (
            visible_projects()
            .filter(pk__in=obj.related_projects.values("pk"))
            .select_related("category", "cover")
            .prefetch_related("cover__variants", "images__media__variants")
        )
        return PublicProjectSerializer(projects, many=True).data


# ---- the owner -------------------------------------------------------------------------------------


class BlogCategorySerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True, allow_unicode=True)
    article_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Category
        fields = ["id", "slug", "title_fa", "title_en", "description_fa", "description_en", "article_count"]
        read_only_fields = ["id", "article_count"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        attrs = _fill_slug(Category, attrs, self.instance)
        return attrs


class BlogTagSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    slug = serializers.SlugField(max_length=80, required=False, allow_blank=True, allow_unicode=True)
    article_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Tag
        fields = ["id", "slug", "title_fa", "title_en", "article_count"]
        read_only_fields = ["id", "article_count"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        return _fill_slug(Tag, attrs, self.instance)


def _fill_slug(model: Any, attrs: dict[str, Any], instance: Any) -> dict[str, Any]:
    from django.utils.text import slugify

    if attrs.get("slug"):
        return attrs
    if instance is not None and "slug" not in attrs:
        return attrs
    title = attrs.get("title_en") or attrs.get("title_fa") or getattr(instance, "title_fa", "")
    base = slugify(str(title), allow_unicode=True)[:70] or model._meta.model_name
    slug, n = base, 2
    qs = model.objects.exclude(pk=instance.pk) if instance else model.objects.all()
    while qs.filter(slug=slug).exists():
        slug = f"{base}-{n}"
        n += 1
    attrs["slug"] = slug
    return attrs


class TranslationSerializer(serializers.Serializer):  # type: ignore[type-arg]
    id = serializers.IntegerField()
    language = serializers.CharField()
    slug = serializers.CharField()
    status = serializers.CharField()


class ArticleSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    body = serializers.JSONField(required=False)
    slug = serializers.SlugField(max_length=120, required=False, allow_blank=True, allow_unicode=True)
    cover = ready_media_field()
    cover_detail = PublicMediaSerializer(source="cover", read_only=True, allow_null=True)
    og_image = ready_media_field()
    og_image_detail = PublicMediaSerializer(source="og_image", read_only=True, allow_null=True)
    tags = serializers.PrimaryKeyRelatedField(many=True, queryset=Tag.objects.all(), required=False)
    related_projects = serializers.PrimaryKeyRelatedField(many=True, queryset=Project.objects.all(), required=False)
    is_live = serializers.SerializerMethodField()
    translations = serializers.SerializerMethodField()
    body_media = serializers.SerializerMethodField()

    class Meta:
        model = Article
        fields = [
            "id", "language", "translation_group", "slug", "title", "summary", "body", "body_media", "cover",
            "cover_detail", "category", "tags", "status", "published_at", "seo_title", "seo_description", "og_image",
            "og_image_detail", "related_projects", "reading_minutes", "is_live", "translations", "created_at",
            "updated_at",
        ]  # fmt: skip
        read_only_fields = ["id", "translation_group", "reading_minutes", "created_at", "updated_at"]
        # DRF would turn the unique constraints into required fields; slugs are made and checked in `validate`.
        validators: list[Any] = []

    def get_is_live(self, obj: Article) -> bool:
        return obj.is_live

    @extend_schema_field(serializers.DictField(child=PublicMediaSerializer()))
    def get_body_media(self, obj: Article) -> Any:
        """Library data (previews, alt texts) for the images in the body, so the editor can show them."""
        ids = media_ids(obj.body) if isinstance(obj.body, dict) else []
        assets = MediaAsset.objects.filter(pk__in=ids, status=MediaAsset.Status.READY).prefetch_related("variants")
        return {str(a.pk): PublicMediaSerializer(a).data for a in assets}

    @extend_schema_field(TranslationSerializer(many=True))
    def get_translations(self, obj: Article) -> Any:
        others = Article.objects.filter(translation_group=obj.translation_group).exclude(pk=obj.pk)
        return [{"id": a.pk, "language": a.language, "slug": a.slug, "status": a.status} for a in others]

    def validate_language(self, value: str) -> str:
        if self.instance is not None and value != self.instance.language:
            raise serializers.ValidationError("زبان مقاله بعد از ساخت تغییر نمی‌کند؛ از «ساخت ترجمه» استفاده کنید.")
        return value

    def validate_body(self, value: Any) -> dict[str, Any]:
        try:
            doc = clean_doc(value)
        except BodyError as error:
            raise serializers.ValidationError(str(error)) from None
        ids = media_ids(doc)
        if ids:
            ready = set(
                map(
                    str,
                    MediaAsset.objects.filter(pk__in=ids, status=MediaAsset.Status.READY).values_list("pk", flat=True),
                )
            )
            if missing := [i for i in ids if i not in ready]:
                raise serializers.ValidationError(
                    f"تصویر داخل متن پیدا نشد یا هنوز پردازش نشده است ({len(missing)} مورد)."
                )
        return doc

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        instance: Article | None = self.instance
        language = attrs.get("language", instance.language if instance else None)
        if language is None:
            raise serializers.ValidationError({"language": "زبان مقاله لازم است."})
        title = attrs.get("title", instance.title if instance else "")
        slug = attrs.get("slug")
        if slug:
            if service.slug_taken(language, slug, exclude_pk=instance.pk if instance else None):
                raise serializers.ValidationError({"slug": "این نشانی در این زبان قبلاً استفاده شده است."})
        elif instance is None or "slug" in attrs:
            attrs["slug"] = service.make_slug(title, language, exclude_pk=instance.pk if instance else None)

        status = attrs.get("status", instance.status if instance else Article.Status.DRAFT)
        published_at = attrs.get("published_at", instance.published_at if instance else None)
        if status == Article.Status.PUBLISHED and published_at is None:
            attrs["published_at"] = timezone.now()
        return attrs

    def _prepare(self, validated: dict[str, Any], language: str) -> dict[str, Any]:
        if "body" in validated:
            validated["reading_minutes"] = reading_minutes(validated["body"], language)
        return validated

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Article:
        tags = validated_data.pop("tags", [])
        projects = validated_data.pop("related_projects", [])
        validated_data.setdefault("body", {"type": "doc", "content": []})
        article = Article(**self._prepare(validated_data, validated_data["language"]))
        article.save()
        article.tags.set(tags)
        article.related_projects.set(projects)
        return article

    @transaction.atomic
    def update(self, instance: Article, validated_data: dict[str, Any]) -> Article:
        tags = validated_data.pop("tags", None)
        projects = validated_data.pop("related_projects", None)
        new_slug = validated_data.pop("slug", None)
        for field, value in self._prepare(validated_data, instance.language).items():
            setattr(instance, field, value)
        instance.save()
        if new_slug:
            service.change_slug(instance, new_slug)
        if tags is not None:
            instance.tags.set(tags)
        if projects is not None:
            instance.related_projects.set(projects)
        return instance


def other_language(language: str) -> str:
    return Language.EN if language == Language.FA else Language.FA
