from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

MAX_QUANTITY = 100_000  # the most items one estimate may ask for, whatever the owner configures


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
    included = models.BooleanField(default=True, help_text="False shows the line as not included")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.text_fa


class QuoteRule(models.Model):
    """One input of the price calculator. Visitors only ever see the label; amounts and factors stay on the server."""

    class Kind(models.TextChoices):
        SERVICE = "service", "قیمت پایه‌ی خدمت (هر محصول)"
        TIER = "tier", "پله‌ی تعداد (ضریب از تعداد مشخص به بعد)"
        ADDON_FIXED = "addon_fixed", "افزونه‌ی ثابت"
        ADDON_PER_ITEM = "addon_per_item", "افزونه به‌ازای هر محصول"
        MULTIPLIER = "multiplier", "ضریب (مثل فوریت)"

    key = models.SlugField(max_length=40, unique=True, help_text="Stable identifier used by the public form")
    kind = models.CharField(max_length=16, choices=Kind.choices)
    label_fa = models.CharField(max_length=120)
    label_en = models.CharField(max_length=120, blank=True)
    amount = models.PositiveBigIntegerField(null=True, blank=True, help_text="Toman")
    factor = models.DecimalField(
        max_digits=5,
        decimal_places=2,
        null=True,
        blank=True,
        validators=[MinValueValidator(Decimal("0.01")), MaxValueValidator(Decimal("20"))],
    )
    min_quantity = models.PositiveIntegerField(null=True, blank=True)
    is_active = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]
        constraints = [
            models.CheckConstraint(
                condition=~Q(kind__in=["service", "addon_fixed", "addon_per_item"]) | Q(amount__isnull=False),
                name="quoterule_amount_for_priced_kinds",
            ),
            models.CheckConstraint(
                condition=~Q(kind="tier") | (Q(factor__isnull=False) & Q(min_quantity__isnull=False)),
                name="quoterule_tier_needs_factor_and_quantity",
            ),
            models.CheckConstraint(
                condition=~Q(kind="multiplier") | Q(factor__isnull=False),
                name="quoterule_multiplier_needs_factor",
            ),
        ]

    def __str__(self) -> str:
        return f"{self.key} ({self.kind})"


class QuoteSettings(models.Model):
    """Singleton: how the calculator turns a price into a range and what quantities it accepts."""

    range_percent = models.PositiveSmallIntegerField(
        default=15, validators=[MaxValueValidator(50)], help_text="The estimate is shown as total ± this percent"
    )
    rounding_step = models.PositiveIntegerField(
        default=10_000,
        validators=[MinValueValidator(1)],
        help_text="Both ends of the range are rounded to this many toman",
    )
    min_quantity = models.PositiveIntegerField(
        default=1, validators=[MinValueValidator(1), MaxValueValidator(MAX_QUANTITY)]
    )
    max_quantity = models.PositiveIntegerField(
        default=200, validators=[MinValueValidator(1), MaxValueValidator(MAX_QUANTITY)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "quote settings"

    def __str__(self) -> str:
        return "quote settings"

    @classmethod
    def load(cls) -> "QuoteSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
