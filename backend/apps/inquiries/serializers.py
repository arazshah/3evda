from __future__ import annotations

import re
from typing import Any

from django.core.files.uploadedfile import UploadedFile
from rest_framework import serializers

from apps.blog.models import Language

from . import attachments
from .models import Inquiry, InquiryAttachment, InquiryStatusChange

# Persian and Arabic-Indic digits → ASCII, so a number typed on a Persian keyboard is stored one way.
_DIGITS = str.maketrans("۰۱۲۳۴۵۶۷۸۹٠١٢٣٤٥٦٧٨٩", "01234567890123456789")
_PHONE = re.compile(r"^[0-9+()\-\s]{5,40}$")

# ---- visitors --------------------------------------------------------------------------------------


class InquiryCreateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    name = serializers.CharField(max_length=120)
    brand = serializers.CharField(max_length=120, required=False, allow_blank=True)
    phone = serializers.CharField(max_length=40, required=False, allow_blank=True)
    whatsapp = serializers.CharField(max_length=120, required=False, allow_blank=True)
    telegram = serializers.CharField(max_length=120, required=False, allow_blank=True)
    email = serializers.EmailField(max_length=254, required=False, allow_blank=True)
    language = serializers.ChoiceField(choices=Language.choices, default=Language.FA)
    service = serializers.SlugField(max_length=40, required=False, allow_blank=True)
    quantity = serializers.IntegerField(min_value=1, required=False)
    addons = serializers.ListField(
        child=serializers.SlugField(max_length=40), max_length=20, required=False, default=list
    )
    multipliers = serializers.ListField(
        child=serializers.SlugField(max_length=40), max_length=20, required=False, default=list
    )
    message = serializers.CharField(max_length=4000, required=False, allow_blank=True)
    # A field no person sees: bots that fill every input give themselves away.
    website = serializers.CharField(max_length=200, required=False, allow_blank=True, write_only=True)
    attachments = serializers.ListField(
        child=serializers.FileField(),
        required=False,
        write_only=True,
        max_length=attachments.MAX_FILES,
        error_messages={"max_length": attachments.MESSAGES["too_many"]},
    )

    def validate_phone(self, value: str) -> str:
        value = value.translate(_DIGITS).strip()
        if value and not _PHONE.match(value):
            raise serializers.ValidationError("شماره‌ی تلفن معتبر نیست.")
        return value

    def validate_attachments(self, files: list[UploadedFile[bytes]]) -> list[tuple[UploadedFile[bytes], str, str]]:
        inspected = []
        for upload in files:
            try:
                mime, ext = attachments.inspect(upload)
            except attachments.AttachmentRejected as error:
                raise serializers.ValidationError(error.message) from error
            inspected.append((upload, mime, ext))
        return inspected

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if not any(attrs.get(f) for f in ("phone", "whatsapp", "telegram", "email")):
            raise serializers.ValidationError(
                {"phone": "دست‌کم یکی از راه‌های تماس (تلفن، واتس‌اپ، تلگرام یا ایمیل) را وارد کنید."}
            )
        if attrs.get("service") and not attrs.get("quantity"):
            raise serializers.ValidationError({"quantity": "تعداد محصول را وارد کنید."})
        return attrs


class InquiryReceivedSerializer(serializers.Serializer):  # type: ignore[type-arg]
    received = serializers.BooleanField()


# ---- owner -----------------------------------------------------------------------------------------


class AttachmentSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = InquiryAttachment
        fields = ["id", "original_name", "mime", "size"]
        read_only_fields = fields


class StatusChangeSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = InquiryStatusChange
        fields = ["from_status", "to_status", "at"]
        read_only_fields = fields


class InquiryListSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    is_new = serializers.SerializerMethodField()
    attachment_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = Inquiry
        fields = [
            "id", "name", "brand", "service_label", "quantity", "estimate_low", "estimate_high", "status",
            "created_at", "is_new", "attachment_count",
        ]  # fmt: skip
        read_only_fields = fields

    def get_is_new(self, obj: Inquiry) -> bool:
        return obj.seen_at is None


class InquirySerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    attachments = AttachmentSerializer(many=True, read_only=True)
    history = StatusChangeSerializer(many=True, read_only=True)

    class Meta:
        model = Inquiry
        fields = [
            "id", "name", "brand", "phone", "whatsapp", "telegram", "email", "language", "service_key",
            "service_label", "quantity", "options", "estimate_low", "estimate_high", "message", "status",
            "internal_note", "seen_at", "created_at", "updated_at", "attachments", "history",
        ]  # fmt: skip
        read_only_fields = [f for f in fields if f not in ("status", "internal_note")]


class InquirySummarySerializer(serializers.Serializer):  # type: ignore[type-arg]
    new = serializers.IntegerField()
