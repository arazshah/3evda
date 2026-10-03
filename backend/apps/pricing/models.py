from django.db import models


class PackageGroup(models.Model):
    """A kind of service the packages belong to (menu photography, e-commerce, campaign, …)."""

    title_fa = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120, blank=True)
    description_fa = models.TextField(blank=True)
    description_en = models.TextField(blank=True)
    position = models.PositiveIntegerField(default=0)
    is_published = models.BooleanField(default=True)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.title_fa


class Package(models.Model):
    class PriceMode(models.TextChoices):
        FROM = "from", "از … شروع می‌شود"
        FIXED = "fixed", "قیمت ثابت"
        INQUIRY = "inquiry", "استعلام"

    group = models.ForeignKey(PackageGroup, on_delete=models.PROTECT, related_name="packages")
    title_fa = models.CharField(max_length=160)
    title_en = models.CharField(max_length=160, blank=True)
    summary_fa = models.TextField(blank=True)
    summary_en = models.TextField(blank=True)
    price_mode = models.CharField(max_length=8, choices=PriceMode.choices, default=PriceMode.INQUIRY)
    price_amount = models.PositiveBigIntegerField(null=True, blank=True, help_text="Toman")
    price_unit_fa = models.CharField(max_length=60, blank=True, help_text="e.g. «به ازای هر محصول»")
    price_unit_en = models.CharField(max_length=60, blank=True)
    badge_fa = models.CharField(max_length=40, blank=True, help_text="e.g. «محبوب»")
    badge_en = models.CharField(max_length=40, blank=True)
    is_featured = models.BooleanField(default=False)
    is_published = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.title_fa


class PackageFeature(models.Model):
    package = models.ForeignKey(Package, on_delete=models.CASCADE, related_name="features")
    text_fa = models.CharField(max_length=200)
    text_en = models.CharField(max_length=200, blank=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.text_fa
