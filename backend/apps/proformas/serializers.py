from decimal import Decimal
from typing import Any

from django.db import transaction
from rest_framework import serializers

from apps.blog.models import Language

from . import service
from .models import Proforma, ProformaItem, ProformaSettings

MAX_ITEMS = 50
MAX_AMOUNT = 10**12  # a thousand billion toman: far above any real job, far below overflow


class ProformaItemSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    line_total = serializers.SerializerMethodField()

    class Meta:
        model = ProformaItem
        fields = ["description", "quantity", "unit_price", "line_total"]
        extra_kwargs = {
            "quantity": {"min_value": 1, "max_value": 100000},
            "unit_price": {"max_value": MAX_AMOUNT},
        }

    def get_line_total(self, obj: ProformaItem) -> int:
        return obj.quantity * obj.unit_price


class ProformaSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    items = ProformaItemSerializer(many=True, required=False)
    status = serializers.SerializerMethodField()
    link = serializers.SerializerMethodField()
    replaces_number = serializers.CharField(source="replaces.number", read_only=True, default=None)

    class Meta:
        model = Proforma
        fields = [
            "id", "number", "status", "language", "customer_name", "customer_company", "customer_contact",
            "inquiry", "replaces", "replaces_number", "discount_amount", "discount_percent", "tax_percent",
            "subtotal", "discount", "tax", "total", "terms", "valid_until", "issue_date", "issued_at", "issuer",
            "seen_at", "responded_at", "rejection_reason", "link", "items", "created_at", "updated_at",
        ]  # fmt: skip
        read_only_fields = [
            "id", "number", "inquiry", "replaces", "subtotal", "discount", "tax", "total", "issue_date",
            "issued_at", "issuer", "seen_at", "responded_at", "rejection_reason", "created_at", "updated_at",
        ]  # fmt: skip
        extra_kwargs = {"discount_amount": {"max_value": MAX_AMOUNT}}

    def get_status(self, obj: Proforma) -> str:
        return service.effective_status(obj)

    def get_link(self, obj: Proforma) -> str | None:
        return service.link_for(obj)

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        if self.instance and self.instance.status != Proforma.Status.DRAFT:
            raise serializers.ValidationError("پیش‌فاکتور صادرشده تغییر نمی‌کند؛ برای اصلاح، نسخه‌ی جدید بسازید.")
        amount = attrs.get("discount_amount", getattr(self.instance, "discount_amount", 0))
        percent = attrs.get("discount_percent", getattr(self.instance, "discount_percent", Decimal(0)))
        if amount and percent:
            raise serializers.ValidationError({"discount_amount": "تخفیف را یا مبلغی بدهید یا درصدی، نه هر دو."})
        if len(attrs.get("items", [])) > MAX_ITEMS:
            raise serializers.ValidationError({"items": f"حداکثر {MAX_ITEMS} آیتم."})
        return attrs

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Proforma:
        items = validated_data.pop("items", [])
        language = validated_data.get("language", "fa")
        for key, value in service.draft_defaults(language).items():
            validated_data.setdefault(key, value)
        proforma = Proforma.objects.create(**validated_data)
        self._set_items(proforma, items)
        return service.recalculate(proforma)

    @transaction.atomic
    def update(self, instance: Proforma, validated_data: dict[str, Any]) -> Proforma:
        items = validated_data.pop("items", None)
        # Locking the row serialises this with `issue`: a draft cannot change while it is being issued.
        instance = Proforma.objects.select_for_update().get(pk=instance.pk)
        if instance.status != Proforma.Status.DRAFT:
            raise serializers.ValidationError("پیش‌فاکتور صادرشده تغییر نمی‌کند؛ برای اصلاح، نسخه‌ی جدید بسازید.")
        for key, value in validated_data.items():
            setattr(instance, key, value)
        instance.save()
        if items is not None:
            self._set_items(instance, items)
        return service.recalculate(instance)

    @staticmethod
    def _set_items(proforma: Proforma, items: list[dict[str, Any]]) -> None:
        proforma.items.all().delete()
        ProformaItem.objects.bulk_create(
            ProformaItem(proforma=proforma, position=i, **row) for i, row in enumerate(items)
        )


class ProformaListSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    status = serializers.SerializerMethodField()

    class Meta:
        model = Proforma
        fields = [
            "id",
            "number",
            "status",
            "language",
            "customer_name",
            "customer_company",
            "total",
            "valid_until",
            "created_at",
        ]
        read_only_fields = fields

    def get_status(self, obj: Proforma) -> str:
        return service.effective_status(obj)


class ProformaFromInquirySerializer(serializers.Serializer):  # type: ignore[type-arg]
    inquiry = serializers.IntegerField()
    language = serializers.ChoiceField(choices=Language.choices, required=False)


class ProformaSettingsSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = ProformaSettings
        exclude = ["id"]
        read_only_fields = ["updated_at"]


class PublicProformaItemSerializer(serializers.Serializer):  # type: ignore[type-arg]
    description = serializers.CharField()
    quantity = serializers.IntegerField()
    unit_price = serializers.IntegerField()
    line_total = serializers.IntegerField()


class PublicProformaSerializer(serializers.Serializer):  # type: ignore[type-arg]
    """Everything the customer needs, and nothing internal (no ids, inquiry, IP or owner notes)."""

    number = serializers.CharField()
    status = serializers.CharField()
    language = serializers.CharField()
    customer_name = serializers.CharField()
    customer_company = serializers.CharField()
    items = PublicProformaItemSerializer(many=True)
    subtotal = serializers.IntegerField()
    discount = serializers.IntegerField()
    discount_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    tax = serializers.IntegerField()
    tax_percent = serializers.DecimalField(max_digits=5, decimal_places=2)
    total = serializers.IntegerField()
    terms = serializers.CharField()
    issue_date = serializers.DateField()
    valid_until = serializers.DateField(allow_null=True)
    issuer = serializers.JSONField()
    rejection_reason = serializers.CharField()
    responded_at = serializers.DateTimeField(allow_null=True)


PUBLIC_FIELDS: list[str] = list(PublicProformaSerializer().get_fields())


class RejectSerializer(serializers.Serializer):  # type: ignore[type-arg]
    reason = serializers.CharField(max_length=500, required=False, allow_blank=True, default="")


def public_data(proforma: Proforma) -> dict[str, Any]:
    items = [
        {
            "description": i.description,
            "quantity": i.quantity,
            "unit_price": i.unit_price,
            "line_total": i.quantity * i.unit_price,
        }
        for i in proforma.items.all()
    ]
    names = [name for name in PUBLIC_FIELDS if name not in ("items", "status")]
    data = {name: getattr(proforma, name) for name in names}
    return {**data, "status": service.effective_status(proforma), "items": items}
