import uuid
from datetime import timedelta

from django.db import models
from django.db.models import Q
from django.utils import timezone

from apps.blog.models import Language
from apps.booking.models import Booking
from apps.inquiries.models import Inquiry
from apps.proformas.models import Proforma


def default_expiry():  # type: ignore[no-untyped-def]
    """Thirty days from creation, until the owner can set her own default."""
    return timezone.now() + timedelta(days=30)


class Gallery(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        PUBLISHED = "published", "منتشرشده"
        SUBMITTED = "submitted", "نهایی‌شده"
        ARCHIVED = "archived", "بایگانی"

    class DownloadLevel(models.TextChoices):
        NONE = "none", "فقط دیدن"
        SELECTED = "selected", "انتخاب‌ها (اندازه‌ی نمایش)"
        ALL_WEB = "all_web", "همه (اندازه‌ی نمایش)"
        SELECTED_ORIGINAL = "selected_original", "انتخاب‌ها با اصل فایل"
        ALL_ORIGINAL = "all_original", "همه با اصل فایل"

    # The address is `public_id` plus a signature that depends on `link_version`: a new link is a new version.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    link_version = models.PositiveIntegerField(default=1)
    title = models.CharField(max_length=160)
    client_name = models.CharField(max_length=120, blank=True)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.FA)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    password_hash = models.CharField(max_length=256, blank=True)
    expires_at = models.DateTimeField(null=True, blank=True, default=default_expiry)
    selection_limit = models.PositiveIntegerField(null=True, blank=True, help_text="Empty: no limit")
    download_level = models.CharField(max_length=20, choices=DownloadLevel.choices, default=DownloadLevel.SELECTED)
    watermark = models.BooleanField(default=True, help_text="Previews carry the watermark")
    note = models.TextField(blank=True, help_text="Private; never shown to the client")

    inquiry = models.ForeignKey(Inquiry, null=True, blank=True, on_delete=models.SET_NULL, related_name="galleries")
    booking = models.ForeignKey(Booking, null=True, blank=True, on_delete=models.SET_NULL, related_name="galleries")
    proforma = models.ForeignKey(Proforma, null=True, blank=True, on_delete=models.SET_NULL, related_name="galleries")

    submitted_at = models.DateTimeField(null=True, blank=True)
    submitted_ip_hash = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        verbose_name_plural = "galleries"
        constraints = [
            models.CheckConstraint(
                condition=Q(selection_limit__isnull=True) | Q(selection_limit__gt=0), name="gallery_limit_positive"
            ),
        ]

    def __str__(self) -> str:
        return self.title

    @property
    def has_password(self) -> bool:
        return bool(self.password_hash)


class GalleryPhoto(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "در صف"
        READY = "ready", "آماده"
        FAILED = "failed", "ناموفق"

    gallery = models.ForeignKey(Gallery, on_delete=models.CASCADE, related_name="photos")
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    original_key = models.CharField(max_length=255, unique=True)
    thumb_key = models.CharField(max_length=255, blank=True)
    preview_key = models.CharField(max_length=255, blank=True)
    original_filename = models.CharField(max_length=255)
    mime = models.CharField(max_length=50)
    size_bytes = models.PositiveBigIntegerField()
    stored_bytes = models.PositiveBigIntegerField(default=0, help_text="Thumbnail and preview together")
    sha256 = models.CharField(max_length=64)
    width = models.PositiveIntegerField(null=True, blank=True)
    height = models.PositiveIntegerField(null=True, blank=True)
    position = models.PositiveIntegerField(default=0)
    error = models.CharField(max_length=300, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["position", "id"]
        constraints = [models.UniqueConstraint(fields=["gallery", "sha256"], name="gallery_photo_unique_content")]

    def __str__(self) -> str:
        return self.original_filename
