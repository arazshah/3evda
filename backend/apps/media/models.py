import uuid

from django.conf import settings
from django.contrib.contenttypes.fields import GenericForeignKey
from django.contrib.contenttypes.models import ContentType
from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models

from .storage import public_storage


class MediaAsset(models.Model):
    class Kind(models.TextChoices):
        IMAGE = "image", "تصویر"
        VIDEO = "video", "ویدیو"

    class Status(models.TextChoices):
        PENDING = "pending", "در صف"
        PROCESSING = "processing", "در حال پردازش"
        READY = "ready", "آماده"
        FAILED = "failed", "ناموفق"

    id = models.UUIDField(primary_key=True, default=uuid.uuid4, editable=False)
    kind = models.CharField(max_length=10, choices=Kind.choices)
    status = models.CharField(max_length=12, choices=Status.choices, default=Status.PENDING, db_index=True)
    original_key = models.CharField(max_length=255, unique=True)
    original_filename = models.CharField(max_length=255)
    mime = models.CharField(max_length=50)
    size_bytes = models.PositiveBigIntegerField()
    sha256 = models.CharField(max_length=64, unique=True)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    duration_seconds = models.FloatField(null=True, blank=True)
    title = models.CharField(max_length=200, blank=True)
    alt_fa = models.CharField("متن جایگزین (فارسی)", max_length=300, blank=True)
    alt_en = models.CharField("متن جایگزین (انگلیسی)", max_length=300, blank=True)
    lqip = models.TextField(blank=True)
    watermarked = models.BooleanField(default=False)
    error = models.CharField(max_length=500, blank=True)
    uploaded_by = models.ForeignKey(settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL)
    created_at = models.DateTimeField(auto_now_add=True, db_index=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at"]

    def __str__(self) -> str:
        return self.title or self.original_filename


class MediaVariant(models.Model):
    asset = models.ForeignKey(MediaAsset, on_delete=models.CASCADE, related_name="variants")
    name = models.CharField(max_length=32)  # w480 … w2400, poster-w960, video
    format = models.CharField(max_length=8)  # webp, avif, mp4, webm
    key = models.CharField(max_length=255, unique=True)
    width = models.PositiveIntegerField()
    height = models.PositiveIntegerField()
    size_bytes = models.PositiveBigIntegerField()

    class Meta:
        ordering = ["name", "format"]
        constraints = [models.UniqueConstraint(fields=["asset", "name", "format"], name="unique_variant")]

    def __str__(self) -> str:
        return self.key

    @property
    def url(self) -> str:
        return str(public_storage().url(self.key))


class MediaReference(models.Model):
    """Where an asset is used. Assets with references cannot be deleted."""

    asset = models.ForeignKey(MediaAsset, on_delete=models.PROTECT, related_name="references")
    content_type = models.ForeignKey(ContentType, on_delete=models.CASCADE)
    object_id = models.CharField(max_length=64)
    field = models.CharField(max_length=64)
    target = GenericForeignKey("content_type", "object_id")

    class Meta:
        constraints = [
            models.UniqueConstraint(fields=["asset", "content_type", "object_id", "field"], name="unique_reference")
        ]

    def __str__(self) -> str:
        return f"{self.content_type}:{self.object_id}.{self.field}"


class WatermarkSetting(models.Model):
    class Position(models.TextChoices):
        BOTTOM_RIGHT = "bottom_right", "پایین راست"
        BOTTOM_LEFT = "bottom_left", "پایین چپ"
        TOP_RIGHT = "top_right", "بالا راست"
        TOP_LEFT = "top_left", "بالا چپ"
        CENTER = "center", "وسط"

    enabled = models.BooleanField(default=False)
    text = models.CharField(max_length=80, default="© 3evda.com")
    opacity = models.FloatField(default=0.35, validators=[MinValueValidator(0.05), MaxValueValidator(1.0)])
    position = models.CharField(max_length=16, choices=Position.choices, default=Position.BOTTOM_RIGHT)
    size_ratio = models.FloatField(
        default=0.035, validators=[MinValueValidator(0.01), MaxValueValidator(0.2)], help_text="text height / width"
    )
    updated_at = models.DateTimeField(auto_now=True)

    def __str__(self) -> str:
        return "watermark"

    @classmethod
    def load(cls) -> "WatermarkSetting":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
