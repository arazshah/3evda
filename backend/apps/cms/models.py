from django.db import models

from apps.media.models import MediaAsset
from apps.media.references import MediaRefsMixin


class SiteSettings(MediaRefsMixin, models.Model):
    """Singleton: brand, contact details and default SEO texts."""

    media_fields = ("logo", "og_image")

    brand_name_fa = models.CharField(max_length=120, default="سودا رحیم‌پور")
    brand_name_en = models.CharField(max_length=120, default="Sevda Rahimpour")
    tagline_fa = models.CharField(max_length=200, blank=True, default="عکاسی غذا و محصول")
    tagline_en = models.CharField(max_length=200, blank=True, default="Food & product photography")
    description_fa = models.TextField(blank=True, help_text="Default meta description")
    description_en = models.TextField(blank=True)
    phone = models.CharField(max_length=40, blank=True)
    email = models.EmailField(blank=True)
    whatsapp = models.CharField(max_length=120, blank=True)
    telegram = models.CharField(max_length=120, blank=True)
    instagram = models.CharField(max_length=120, blank=True, default="3evda.r")
    address_fa = models.CharField(max_length=300, blank=True, default="ارومیه")
    address_en = models.CharField(max_length=300, blank=True, default="Urmia, Iran")
    map_url = models.URLField(blank=True)
    footer_text_fa = models.TextField(blank=True)
    footer_text_en = models.TextField(blank=True)
    logo = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    og_image = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "site settings"

    def __str__(self) -> str:
        return "site settings"

    @classmethod
    def load(cls) -> "SiteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ContentBlock(MediaRefsMixin, models.Model):
    """One editable text (and/or image) slot. The set of keys is defined in `blocks.py`."""

    media_fields = ("media",)

    key = models.CharField(max_length=64, unique=True)
    text_fa = models.TextField(blank=True)
    text_en = models.TextField(blank=True)
    media = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["key"]

    def __str__(self) -> str:
        return self.key


class ContentItem(MediaRefsMixin, models.Model):
    """A repeatable entry (hero slide, service, FAQ, …) shown in an ordered list on the site."""

    media_fields = ("media",)

    class Collection(models.TextChoices):
        HERO_SLIDE = "hero_slide", "اسلاید هیرو"
        SERVICE = "service", "خدمت"
        PROCESS_STEP = "process_step", "مرحله‌ی همکاری"
        CLIENT = "client", "مشتری"
        TESTIMONIAL = "testimonial", "نظر مشتری"
        BEHIND_SCENES = "behind_scenes", "پشت صحنه"
        FAQ = "faq", "پرسش پرتکرار"
        NAV_LINK = "nav_link", "پیوند منو"

    collection = models.CharField(max_length=20, choices=Collection.choices, db_index=True)
    position = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)
    title_fa = models.CharField(max_length=200, blank=True)
    title_en = models.CharField(max_length=200, blank=True)
    subtitle_fa = models.CharField(max_length=300, blank=True)
    subtitle_en = models.CharField(max_length=300, blank=True)
    body_fa = models.TextField(blank=True)
    body_en = models.TextField(blank=True)
    link_url = models.CharField(max_length=300, blank=True)
    media = models.ForeignKey(MediaAsset, null=True, blank=True, on_delete=models.PROTECT, related_name="+")
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["collection", "position", "id"]
        indexes = [models.Index(fields=["collection", "is_published", "position"])]

    def __str__(self) -> str:
        return f"{self.collection}: {self.title_fa or self.title_en or self.pk}"
