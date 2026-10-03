import uuid
from typing import Any

from django.contrib.contenttypes.models import ContentType
from django.db import models, transaction
from django.utils import timezone

from apps.media.models import MediaAsset, MediaReference
from apps.media.references import MediaRefsMixin
from apps.portfolio.models import Project

from .body import media_ids


class Language(models.TextChoices):
    FA = "fa", "فارسی"
    EN = "en", "English"


class Category(models.Model):
    slug = models.SlugField(max_length=80, unique=True, allow_unicode=True)
    title_fa = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120, blank=True)
    description_fa = models.TextField(blank=True)
    description_en = models.TextField(blank=True)

    class Meta:
        ordering = ["title_fa", "id"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.title_fa


class Tag(models.Model):
    slug = models.SlugField(max_length=80, unique=True, allow_unicode=True)
    title_fa = models.CharField(max_length=80)
    title_en = models.CharField(max_length=80, blank=True)

    class Meta:
        ordering = ["title_fa", "id"]

    def __str__(self) -> str:
        return self.title_fa


class ArticleQuerySet(models.QuerySet["Article"]):
    def visible(self) -> "ArticleQuerySet":
        """What visitors may read: published, and its publication time has arrived."""
        return self.filter(status=Article.Status.PUBLISHED, published_at__lte=timezone.now())


class Article(MediaRefsMixin, models.Model):
    """One article in one language. The fa and en versions share a `translation_group`."""

    media_fields = ("cover", "og_image")

    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"  # with a future `published_at` it is «scheduled»

    language = models.CharField(max_length=2, choices=Language.choices)
    translation_group = models.UUIDField(default=uuid.uuid4, db_index=True)
    slug = models.SlugField(max_length=120, allow_unicode=True)
    title = models.CharField(max_length=200)
    summary = models.TextField(blank=True)
    body = models.JSONField(default=dict, blank=True)
    cover = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.SET_NULL, related_name="articles")
    tags = models.ManyToManyField(Tag, blank=True, related_name="articles")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    published_at = models.DateTimeField(null=True, blank=True)
    reading_minutes = models.PositiveSmallIntegerField(default=1)
    seo_title = models.CharField(max_length=120, blank=True)
    seo_description = models.CharField(max_length=300, blank=True)
    og_image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    related_projects = models.ManyToManyField(Project, blank=True, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    objects = ArticleQuerySet.as_manager()

    class Meta:
        ordering = ["-published_at", "-created_at", "id"]
        constraints = [
            models.UniqueConstraint(fields=["language", "slug"], name="unique_article_slug_per_language"),
            models.UniqueConstraint(fields=["translation_group", "language"], name="one_article_per_language_in_group"),
        ]
        indexes = [models.Index(fields=["language", "status", "published_at"])]

    def __str__(self) -> str:
        return f"[{self.language}] {self.title}"

    def save(self, *args: Any, **kwargs: Any) -> None:
        with transaction.atomic():
            super().save(*args, **kwargs)
            # The live slug is never also a redirect: a live article wins over someone's old address.
            ArticleSlugRedirect.objects.filter(language=self.language, old_slug=self.slug).delete()
            self._sync_body_references()

    @property
    def is_live(self) -> bool:
        return (
            self.status == self.Status.PUBLISHED
            and self.published_at is not None
            and self.published_at <= timezone.now()
        )

    def _sync_body_references(self) -> None:
        """Images embedded in the body are references too: a used image can't be deleted from the library."""
        content_type = ContentType.objects.get_for_model(self)
        wanted = {uuid.UUID(i) for i in media_ids(self.body)} if isinstance(self.body, dict) else set()
        current = MediaReference.objects.filter(content_type=content_type, object_id=str(self.pk), field="body")
        current.exclude(asset_id__in=wanted).delete()
        for asset_id in wanted:
            MediaReference.objects.get_or_create(
                asset_id=asset_id, content_type=content_type, object_id=str(self.pk), field="body"
            )


class ArticleSlugRedirect(models.Model):
    """An old address of an article; it answers with a permanent redirect to the current one."""

    article = models.ForeignKey(Article, on_delete=models.CASCADE, related_name="redirects")
    language = models.CharField(max_length=2, choices=Language.choices)
    old_slug = models.SlugField(max_length=120, allow_unicode=True)

    class Meta:
        constraints = [models.UniqueConstraint(fields=["language", "old_slug"], name="unique_redirect_per_language")]

    def __str__(self) -> str:
        return f"{self.language}/{self.old_slug} → {self.article_id}"
