from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models


class RetentionSettings(models.Model):
    """Singleton. How long personal details are kept; editable in the panel.

    Issued proformas are financial documents: they are never deleted and their numbers, items, amounts, dates
    and status never change. Only the customer's personal details on them have a (longer) limit of their own.
    """

    enabled = models.BooleanField(default=True, help_text="Off: nothing is ever anonymised or deleted")
    inquiry_months = models.PositiveSmallIntegerField(
        default=24, validators=[MinValueValidator(3), MaxValueValidator(120)], help_text="Enquiries, then anonymised"
    )
    booking_months = models.PositiveSmallIntegerField(
        default=24,
        validators=[MinValueValidator(3), MaxValueValidator(120)],
        help_text="Months after the session, then anonymised",
    )
    gallery_days = models.PositiveSmallIntegerField(
        default=90,
        validators=[MinValueValidator(7), MaxValueValidator(730)],
        help_text="Days after a gallery expired or was archived, then deleted with all its files",
    )
    proforma_months = models.PositiveSmallIntegerField(
        default=60,
        validators=[MinValueValidator(12), MaxValueValidator(240)],
        help_text="Months after issue; only the customer's personal details are anonymised",
    )
    last_run_at = models.DateTimeField(null=True, blank=True)
    last_run = models.JSONField(default=dict, blank=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "retention settings"

    def __str__(self) -> str:
        return "retention settings"

    @classmethod
    def load(cls) -> "RetentionSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj
