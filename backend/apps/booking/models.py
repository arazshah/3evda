import uuid

from django.core.validators import MaxValueValidator, MinValueValidator
from django.db import models
from django.db.models import F, Q

from apps.blog.models import Language
from apps.inquiries.models import Inquiry
from apps.pricing.models import Package
from apps.proformas.models import Proforma

TIMEZONE = "Asia/Tehran"


class BookingSettings(models.Model):
    """Singleton. Its row is also the lock every booking change takes, so changes happen one at a time."""

    max_per_day = models.PositiveSmallIntegerField(
        default=3, validators=[MinValueValidator(1), MaxValueValidator(50)], help_text="Active bookings per day"
    )
    min_notice_hours = models.PositiveSmallIntegerField(default=24, validators=[MaxValueValidator(720)])
    horizon_days = models.PositiveSmallIntegerField(
        default=60, validators=[MinValueValidator(1), MaxValueValidator(365)]
    )
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        verbose_name_plural = "booking settings"

    def __str__(self) -> str:
        return "booking settings"

    @classmethod
    def load(cls) -> "BookingSettings":
        obj, _ = cls.objects.get_or_create(pk=1)
        return obj


class SessionType(models.Model):
    key = models.SlugField(max_length=40, unique=True)
    title_fa = models.CharField(max_length=120)
    title_en = models.CharField(max_length=120, blank=True)
    duration_minutes = models.PositiveSmallIntegerField(validators=[MinValueValidator(15), MaxValueValidator(720)])
    buffer_minutes = models.PositiveSmallIntegerField(default=0, validators=[MaxValueValidator(240)])
    is_active = models.BooleanField(default=True)
    position = models.PositiveIntegerField(default=0)

    class Meta:
        ordering = ["position", "id"]

    def __str__(self) -> str:
        return self.key

    def title(self, language: str) -> str:
        return (self.title_en or self.title_fa) if language == "en" else self.title_fa


class WorkingHours(models.Model):
    """One working interval on one weekday (`date.weekday()`: Monday is 0, Saturday 5, Sunday 6)."""

    weekday = models.PositiveSmallIntegerField(validators=[MaxValueValidator(6)])
    start = models.TimeField()
    end = models.TimeField()

    class Meta:
        ordering = ["weekday", "start"]
        constraints = [models.CheckConstraint(condition=Q(end__gt=F("start")), name="workinghours_end_after_start")]

    def __str__(self) -> str:
        return f"{self.weekday} {self.start}-{self.end}"


class ClosedPeriod(models.Model):
    start_date = models.DateField()
    end_date = models.DateField()
    reason = models.CharField(max_length=200, blank=True)

    class Meta:
        ordering = ["start_date", "id"]
        constraints = [
            models.CheckConstraint(condition=Q(end_date__gte=F("start_date")), name="closed_end_not_before_start")
        ]

    def __str__(self) -> str:
        return f"{self.start_date}..{self.end_date}"


class Booking(models.Model):
    class Status(models.TextChoices):
        PENDING = "pending", "در انتظار تأیید"
        CONFIRMED = "confirmed", "تأییدشده"
        COMPLETED = "completed", "انجام‌شده"
        CANCELLED = "cancelled", "لغو"

    class CancelledBy(models.TextChoices):
        CUSTOMER = "customer", "مشتری"
        ADMIN = "admin", "ادمین"

    public_id = models.UUIDField(default=uuid.uuid4, unique=True, editable=False)
    status = models.CharField(max_length=10, choices=Status.choices, default=Status.PENDING)
    language = models.CharField(max_length=2, choices=Language.choices, default=Language.FA)

    session_type = models.ForeignKey(SessionType, on_delete=models.PROTECT, related_name="bookings")
    session_label = models.CharField(max_length=120, help_text="Title as the customer saw it")
    start_at = models.DateTimeField()
    end_at = models.DateTimeField()
    # The time the photographer is taken up until: end plus the buffer. Overlaps are judged on this.
    blocked_until = models.DateTimeField()

    name = models.CharField(max_length=120)
    brand = models.CharField(max_length=120, blank=True)
    phone = models.CharField(max_length=40, blank=True)
    whatsapp = models.CharField(max_length=120, blank=True)
    telegram = models.CharField(max_length=120, blank=True)
    email = models.EmailField(blank=True)
    notes = models.TextField(blank=True, max_length=2000)

    package = models.ForeignKey(Package, null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings")
    package_label = models.CharField(max_length=120, blank=True)
    inquiry = models.ForeignKey(Inquiry, null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings")
    proforma = models.ForeignKey(Proforma, null=True, blank=True, on_delete=models.SET_NULL, related_name="bookings")

    internal_note = models.TextField(blank=True)
    seen_at = models.DateTimeField(null=True, blank=True)
    cancelled_by = models.CharField(max_length=10, choices=CancelledBy.choices, blank=True)
    cancel_reason = models.CharField(max_length=300, blank=True)
    created_by_admin = models.BooleanField(default=False)
    anonymized_at = models.DateTimeField(
        null=True, blank=True, db_index=True, help_text="Personal details were removed"
    )
    ip_hash = models.CharField(max_length=64, blank=True)
    created_at = models.DateTimeField(auto_now_add=True)
    updated_at = models.DateTimeField(auto_now=True)

    class Meta:
        ordering = ["start_at", "id"]
        indexes = [models.Index(fields=["status", "start_at"])]
        constraints = [
            models.CheckConstraint(condition=Q(end_at__gt=F("start_at")), name="booking_end_after_start"),
            models.CheckConstraint(condition=Q(blocked_until__gte=F("end_at")), name="booking_blocked_after_end"),
        ]

    def __str__(self) -> str:
        return f"{self.name} {self.start_at:%Y-%m-%d %H:%M}"

    @property
    def is_active(self) -> bool:
        return self.status in (self.Status.PENDING, self.Status.CONFIRMED)
