import uuid
from decimal import Decimal

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import Q

from apps.blog.models import Language
from apps.inquiries.models import Inquiry


def percent_field() -> models.DecimalField:  # type: ignore[type-arg]
    return models.DecimalField(
        max_digits=5,
        decimal_places=2,
        default=Decimal(0),
        validators=[MinValueValidator(Decimal(0)), MaxValueValidator(Decimal(100))],
    )


class ProformaSettings(models.Model):
    """Singleton: who issues the proformas and the defaults a new draft starts from."""

    issuer_name_fa = models.CharField(max_length=120, blank=True)
    issuer_name_en = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    address_fa = models.CharField(max_length=300, blank=True)
    address_en = models.CharField(max_length=300, blank=True)
    terms_fa = models.TextField(blank=True)
    terms_en = models.TextField(blank=True)
    footer_fa = models.CharField(max_length=300, blank=True)
    footer_en = models.CharField(max_length=300, blank=True)
    default_validity_days = models.PositiveSmallIntegerField(
        default=14, validators=[MinValueValidator(1), MaxValueValidator(365)]
    )
    default_tax_percent = percent_field()
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "proforma settings"

    def __str__(self) -> str:
        return "proforma settings"

    @classmethod
    def load(cls) -> "ProformaSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class ProformaCounter(models.Model):
    """The last number given in one Jalali year. Locked while a proforma is issued, so numbers never repeat."""

    year = models.PositiveIntegerField(unique=True)
    last_number = models.PositiveIntegerField(default=0)

    def __str__(self) -> str:
        return f"{self.year}: {self.last_number}"


class Proforma(models.Model):
    class Status(models.TextChoices):
        DRAFT = "draft", "پیش‌نویس"
        SENT = "sent", "ارسال‌شده"
        VIEWED = "viewed", "دیده‌شده"
        APPROVED = "approved", "تأییدشده"
        REJECTED = "rejected", "ردشده"
        SUPERSEDED = "superseded", "جایگزین‌شده"
        CANCELLED = "cancelled", "لغوشده"

    # The address is `public_id` plus a signature that depends on `link_version`: a new link is a new version.
    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    link_version = models.PositiveIntegerField(default=1)
    number = models.CharField(max_length=20, unique=True, null=True, blank=True)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.DRAFT)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.FA)

    customer_name = models.CharField(max_length=120)
    customer_company = models.CharField(max_length=120, blank=True)
    customer_contact = models.CharField(max_length=200, blank=True)
    inquiry = models.ForeignKey(Inquiry, null=True, blank=True, on_delete=models.SET_NULL, related_name="proformas")
    replaces = models.ForeignKey("self", null=True, blank=True, on_delete=models.SET_NULL, related_name="replaced_by")

    discount_amount = models.PositiveBigIntegerField(default=0, help_text="Toman; use this or the percent, not both")
    discount_percent = percent_field()
    tax_percent = percent_field()
    # Calculated from the items (see totals.py) whenever a draft changes; fixed once it is issued.
    subtotal = models.PositiveBigIntegerField(default=0)
    discount = models.PositiveBigIntegerField(default=0)
    tax = models.PositiveBigIntegerField(default=0)
    total = models.PositiveBigIntegerField(default=0)

    terms = models.TextField(blank=True)
    valid_until = models.DateField(null=True, blank=True)
    issue_date = models.DateField(null=True, blank=True)
    issued_at = models.DateTimeField(null=True, blank=True)
    issuer = models.JSONField(default=dict, blank=True, help_text="Who issued it, frozen when it was issued")

    seen_at = models.DateTimeField(null=True, blank=True)
    responded_at = models.DateTimeField(null=True, blank=True)
    response_ip_hash = models.CharField(max_length=64, blank=True)
    response_user_agent = models.CharField(max_length=200, blank=True)
    rejection_reason = models.CharField(max_length=500, blank=True)

    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "-created_at"])]
        constraints = [
            models.CheckConstraint(
                condition=~(Q(discount_amount__gt=0) & Q(discount_percent__gt=0)),
                name="proforma_one_kind_of_discount",
            ),
        ]

    def __str__(self) -> str:
        return self.number or f"draft {self.pk}"


class ProformaItem(models.Model):
    proforma = models.ForeignKey(Proforma, on_delete=models.CASCADE, related_name="items")
    description = models.CharField(max_length=200)
    quantity = models.PositiveIntegerField(validators=[MinValueValidator(1)])
    unit_price = models.PositiveBigIntegerField(help_text="Toman")
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.description
