from __future__ import annotations

import re
from datetime import date, time
from itertools import pairwise
from typing import Any

from rest_framework import serializers

from apps.blog.models import Language
from apps.inquiries.models import Inquiry
from apps.pricing.models import Package
from apps.proformas.models import Proforma

from .messages import t
from .models import Booking, BookingSettings, ClosedPeriod, SessionType, WorkingHours
from .slots import TZ

_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_PHONE = re.compile(r"^[0-9+()\-\s]{5,40}$")


def local_date(booking: Booking) -> date:
    return booking.start_at.astimezone(TZ).date()


def hhmm(value: time) -> str:
    return value.strftime("%H:%M")


# ---- visitors --------------------------------------------------------------------------------------


class PublicSessionTypeSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = SessionType
        fields = ["key", "title_fa", "title_en", "duration_minutes"]
        read_only_fields = fields


class PublicOptionsSerializer(serializers.Serializer):  # type: ignore[type-arg]
    session_types = PublicSessionTypeSerializer(many=True)
    horizon_days = serializers.IntegerField()
    min_notice_hours = serializers.IntegerField()


class AvailableDaySerializer(serializers.Serializer):  # type: ignore[type-arg]
    date = serializers.DateField()
    times = serializers.ListField(child=serializers.CharField())


class AvailabilitySerializer(serializers.Serializer):  # type: ignore[type-arg]
    days = AvailableDaySerializer(many=True)


class BookingCreateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    type = serializers.SlugField(max_length=40)
    date = serializers.DateField()
    time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])
    name = serializers.CharField(max_length=120)
    brand = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    whatsapp = serializers.CharField(max_length=120, required=False, allow_blank=True)
    telegram = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    language = serializers.ChoiceField(choices=Language.choices, default=Language.FA)
    package = serializers.IntegerField(required=False, allow_null=True)
    # A field no person sees: bots that fill every input give themselves away.
    website = serializers.CharField(max_length=200, required=False, allow_blank=True, write_only=True)

    def validate_phone(self, value: str) -> str:
        value = value.translate(_DIGITS).strip()
        if value and not _PHONE.match(value):
            raise serializers.ValidationError(t("phone_invalid", str(self.context.get("language", "fa"))))
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        language = str(self.context.get("language", "fa"))
        if not any(attrs.get(f) for f in ("phone", "whatsapp", "telegram", "email")):
            raise serializers.ValidationError({"phone": t("contact_required", language)})
        stype = SessionType.objects.filter(key=attrs["type"]).first()
        if stype is None or not stype.is_active:
            raise serializers.ValidationError({"type": t("type_unavailable", language)})
        attrs["session_type"] = stype
        if attrs.get("package") is not None:
            package = Package.objects.filter(pk=attrs["package"], is_published=True).first()
            if package is None:
                raise serializers.ValidationError({"package": t("type_unavailable", language)})
            attrs["package"] = package
        else:
            attrs.pop("package", None)
        return attrs


class PublicBookingSerializer(serializers.Serializer):  # type: ignore[type-arg]
    """What the customer sees of their own booking (no ids, no internal notes)."""

    status = serializers.CharField()
    language = serializers.CharField()
    session_label = serializers.CharField()
    date = serializers.DateField()
    time = serializers.CharField()
    end_time = serializers.CharField()
    name = serializers.CharField()
    package_label = serializers.CharField()
    cancelled_by = serializers.CharField()
    can_cancel = serializers.BooleanField()


class BookingReceivedSerializer(PublicBookingSerializer):
    link = serializers.CharField()


def public_data(booking: Booking, *, now: Any = None) -> dict[str, Any]:
    from django.utils import timezone

    local = booking.start_at.astimezone(TZ)
    return {
        "status": booking.status,
        "language": booking.language,
        "session_label": booking.session_label,
        "date": local.date(),
        "time": hhmm(local.time()),
        "end_time": hhmm(booking.end_at.astimezone(TZ).time()),
        "name": booking.name,
        "package_label": booking.package_label,
        "cancelled_by": booking.cancelled_by,
        "can_cancel": booking.is_active and booking.start_at > (now or timezone.now()),
    }


# ---- owner -----------------------------------------------------------------------------------------


class SessionTypeSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    key = serializers.RegexField(r"^[A-Za-z0-9_\-]+$", max_length=40)

    class Meta:
        model = SessionType
        fields = ["id", "key", "title_fa", "title_en", "duration_minutes", "buffer_minutes", "is_active", "position"]
        read_only_fields = ["id", "position"]


class ClosedPeriodSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = ClosedPeriod
        fields = ["id", "start_date", "end_date", "reason"]
        read_only_fields = ["id"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        start = attrs.get("start_date", getattr(self.instance, "start_date", None))
        end = attrs.get("end_date", getattr(self.instance, "end_date", None))
        if start and end and end < start:
            raise serializers.ValidationError({"end_date": "تاریخ پایان نباید قبل از شروع باشد."})
        return attrs


class BookingSettingsSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = BookingSettings
        exclude = ["id"]
        read_only_fields = ["updated_at"]


class WorkingHoursSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = WorkingHours
        fields = ["weekday", "start", "end"]

    def validate_weekday(self, value: int) -> int:
        if value > 6:
            raise serializers.ValidationError("روز هفته باید بین ۰ و ۶ باشد.")
        return value

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if attrs["end"] <= attrs["start"]:
            raise serializers.ValidationError({"end": "پایان باید بعد از شروع باشد."})
        return attrs


class WeeklyHoursSerializer(serializers.Serializer):  # type: ignore[type-arg]
    hours = WorkingHoursSerializer(many=True)

    def validate_hours(self, rows: list[dict[str, Any]]) -> list[dict[str, Any]]:
        if len(rows) > 70:
            raise serializers.ValidationError("حداکثر ۷۰ بازه.")
        by_day: dict[int, list[tuple[time, time]]] = {}
        for row in rows:
            by_day.setdefault(row["weekday"], []).append((row["start"], row["end"]))
        for intervals in by_day.values():
            intervals.sort()
            for (_, end), (start, _) in pairwise(intervals):
                if start < end:
                    raise serializers.ValidationError("بازه‌های یک روز نباید هم‌پوشانی داشته باشند.")
        return rows


class BookingListSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    date = serializers.SerializerMethodField()
    time = serializers.SerializerMethodField()
    end_time = serializers.SerializerMethodField()
    is_new = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "status", "session_label", "session_type", "start_at", "end_at", "date", "time", "end_time",
            "name", "brand", "phone", "package_label", "is_new",
        ]  # fmt: skip
        read_only_fields = fields

    def get_date(self, obj: Booking) -> str:
        return local_date(obj).isoformat()

    def get_time(self, obj: Booking) -> str:
        return hhmm(obj.start_at.astimezone(TZ).time())

    def get_end_time(self, obj: Booking) -> str:
        return hhmm(obj.end_at.astimezone(TZ).time())

    def get_is_new(self, obj: Booking) -> bool:
        return obj.seen_at is None


class BookingSerializer(BookingListSerializer):
    link = serializers.SerializerMethodField()

    class Meta:
        model = Booking
        fields = [
            "id", "status", "language", "session_label", "session_type", "start_at", "end_at", "date", "time",
            "end_time", "name", "brand", "phone", "whatsapp", "telegram", "email", "notes", "package",
            "package_label", "inquiry", "proforma", "internal_note", "seen_at", "cancelled_by", "cancel_reason",
            "created_by_admin", "created_at", "updated_at", "link", "is_new",
        ]  # fmt: skip
        read_only_fields = [f for f in fields if f != "internal_note"]

    def get_link(self, obj: Booking) -> str:
        from .links import public_url

        return public_url(obj)


class AdminBookingCreateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    session_type = serializers.PrimaryKeyRelatedField(queryset=SessionType.objects.all())
    date = serializers.DateField()
    time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])
    status = serializers.ChoiceField(
        choices=[Booking.Status.PENDING, Booking.Status.CONFIRMED], default=Booking.Status.CONFIRMED
    )
    name = serializers.CharField(max_length=120)
    brand = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    whatsapp = serializers.CharField(max_length=120, required=False, allow_blank=True)
    telegram = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    notes = serializers.CharField(max_length=2000, required=False, allow_blank=True)
    language = serializers.ChoiceField(choices=Language.choices, default=Language.FA)
    package = serializers.PrimaryKeyRelatedField(queryset=Package.objects.all(), required=False, allow_null=True)
    inquiry = serializers.PrimaryKeyRelatedField(queryset=Inquiry.objects.all(), required=False, allow_null=True)
    proforma = serializers.PrimaryKeyRelatedField(queryset=Proforma.objects.all(), required=False, allow_null=True)


class RescheduleSerializer(serializers.Serializer):  # type: ignore[type-arg]
    date = serializers.DateField()
    time = serializers.TimeField(format="%H:%M", input_formats=["%H:%M"])


class ReasonSerializer(serializers.Serializer):  # type: ignore[type-arg]
    reason = serializers.CharField(max_length=300, required=False, allow_blank=True, default="")


class BookingSummarySerializer(serializers.Serializer):  # type: ignore[type-arg]
    pending = serializers.IntegerField()
