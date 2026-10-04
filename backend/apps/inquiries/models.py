from django.conf import settings
from django.db import models


class Inquiry(models.Model):
    """A price enquiry from the site. The estimate shown to the visitor is stored with it, so later edits of
    the pricing rules never change what an old enquiry says."""

    class Status(models.TextChoices):
        NEW = "new", "جدید"
        REVIEWING = "reviewing", "در بررسی"
        PROFORMA_SENT = "proforma_sent", "پیش‌فاکتور ارسال شد"
        CONVERTED = "converted", "تبدیل شد (رزرو یا پروژه)"
        CLOSED = "closed", "بسته"

    name = models.CharField(max_length=120)
    brand = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=120, blank=True)
    telegram = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    language = models.CharField(max_length=2, default="fa")
    service_key = models.CharField(max_length=40, blank=True)
    service_label = models.CharField(max_length=120, blank=True)
    quantity = models.PositiveIntegerField(null=True, blank=True)
    # What was chosen, with the labels the visitor saw: {"addons": [{"key", "label"}], "multipliers": [...]}
    options = models.JSONField(default=dict, blank=True)
    estimate_low = models.PositiveBigIntegerField(null=True, blank=True)
    estimate_high = models.PositiveBigIntegerField(null=True, blank=True)
    message = models.TextField(blank=True)
    status = models.CharField(max_length=14, choices=Status.choices, default=Status.NEW)
    internal_note = models.TextField(blank=True)
    ip_hash = models.CharField(max_length=64, blank=True)
    seen_at = models.DateTimeField(null=True, blank=True, help_text="First time the owner opened it")
    anonymized_at = models.DateTimeField(
        null=True, blank=True, db_index=True, help_text="Personal details were removed"
    )
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["-created_at", "-id"]
        indexes = [models.Index(fields=["status", "-created_at"])]
        verbose_name_plural = "inquiries"

    def __str__(self) -> str:
        return f"{self.name} ({self.created_at:%Y-%m-%d})"


class InquiryStatusChange(models.Model):
    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name="history")
    from_status = models.CharField(max_length=14, choices=Inquiry.Status.choices)
    to_status = models.CharField(max_length=14, choices=Inquiry.Status.choices)
    changed_by = models.ForeignKey(
        settings.AUTH_USER_MODEL, null=True, blank=True, on_delete=models.SET_NULL, related_name="+"
    )
    at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["at", "id"]

    def __str__(self) -> str:
        return f"{self.from_status} → {self.to_status}"


class InquiryAttachment(models.Model):
    """A file the visitor attached. Kept in the private bucket and only ever downloaded by the owner."""

    inquiry = models.ForeignKey(Inquiry, on_delete=models.CASCADE, related_name="attachments")
    key = models.CharField(max_length=255, unique=True)
    original_name = models.CharField(max_length=200)
    mime = models.CharField(max_length=60)
    size = models.PositiveIntegerField()
    created_at = models.DateTimeField(auto_now_add=True)

    class Meta:
        ordering = ["id"]

    def __str__(self) -> str:
        return self.original_name
