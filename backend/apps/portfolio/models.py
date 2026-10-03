from django.db import models

from apps.media.models import MediaAsset
from apps.media.references import MediaRefsMixin


class Category(MediaRefsMixin, models.Model):
    media_fields = ("cover",)

    slug = models.SlugField(max_length=80, unique=True)
    title_fa = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120, blank=True)
    description_fa = models.TextField(blank=True)
    description_en = models.TextField(blank=True)
    cover = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    position = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "id"]
        verbose_name_plural = "categories"

    def __str__(self) -> str:
        return self.title_fa


class Project(MediaRefsMixin, models.Model):
    media_fields = ("cover",)

    class Style(models.TextChoices):
        LOW_KEY = "low_key", "Low-key"
        HIGH_KEY = "high_key", "High-key"
        NATURAL = "natural", "نور طبیعی"

    slug = models.SlugField(max_length=80, unique=True)
    category = models.ForeignKey(Category, null=True, blank=True, on_delete=models.PROTECT, related_name="projects")
    style = models.CharField(max_length=10, choices=Style.choices, blank=True)
    title_fa = models.CharField(max_length=200)
    title_en = models.CharField(max_length=200, blank=True)
    summary_fa = models.TextField(blank=True)
    summary_en = models.TextField(blank=True)
    body_fa = models.TextField(blank=True, help_text="Case study")
    body_en = models.TextField(blank=True)
    client_fa = models.CharField(max_length=120, blank=True)
    client_en = models.CharField(max_length=120, blank=True)
    year = models.PositiveSmallIntegerField(null=True, blank=True)
    cover = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=False)
    position = models.PositiveIntegerField(default=0)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["position", "-created_at", "id"]
        indexes = [models.Index(fields=["is_published", "position"])]

    def __str__(self) -> str:
        return self.title_fa


class ProjectImage(MediaRefsMixin, models.Model):
    media_fields = ("media",)

    project = models.ForeignKey(Project, on_delete=models.CASCADE, related_name="images")
    media = models.ForeignKey(MediaAsset, on_delete=models.PROTECT, related_name="+")
    caption_fa = models.CharField(max_length=300, blank=True)
    caption_en = models.CharField(max_length=300, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return f"{self.project_id}#{self.position}"
