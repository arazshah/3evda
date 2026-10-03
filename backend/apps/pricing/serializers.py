from typing import Any

from django.db import transaction
from rest_framework import serializers

from .models import Package, PackageFeature, PackageGroup, QuoteRule, QuoteSettings

# ---- visitors --------------------------------------------------------------------------------------


class PublicFeatureSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = PackageFeature
        fields = ["text_fa", "text_en", "included"]
        read_only_fields = fields


class PublicPackageSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    features = PublicFeatureSerializer(many=True, read_only=True)

    class Meta:
        model = Package
        fields = [
            "id", "title_fa", "title_en", "summary_fa", "summary_en", "price_mode", "price_amount", "price_unit_fa",
            "price_unit_en", "badge_fa", "badge_en", "is_featured", "features",
        ]  # fmt: skip
        read_only_fields = fields


class PublicGroupSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    packages = PublicPackageSerializer(many=True, read_only=True)

    class Meta:
        model = PackageGroup
        fields = ["id", "title_fa", "title_en", "description_fa", "description_en", "packages"]
        read_only_fields = fields


class PublicPackagesSerializer(serializers.Serializer):  # type: ignore[type-arg]
    groups = PublicGroupSerializer(many=True)


# ---- the owner -------------------------------------------------------------------------------------


class PackageGroupSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    package_count = serializers.IntegerField(read_only=True)

    class Meta:
        model = PackageGroup
        fields = [
            "id", "title_fa", "title_en", "description_fa", "description_en", "position", "is_published",
            "package_count",
        ]  # fmt: skip
        read_only_fields = ["id", "position", "package_count"]


class FeatureSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = PackageFeature
        fields = ["text_fa", "text_en", "included"]


class PackageSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    features = FeatureSerializer(many=True, required=False)

    class Meta:
        model = Package
        fields = [
            "id", "group", "title_fa", "title_en", "summary_fa", "summary_en", "price_mode", "price_amount",
            "price_unit_fa", "price_unit_en", "badge_fa", "badge_en", "is_featured", "is_published", "position",
            "features",
        ]  # fmt: skip
        read_only_fields = ["id", "position"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        mode = attrs.get("price_mode", getattr(self.instance, "price_mode", Package.PriceMode.INQUIRY))
        if mode == Package.PriceMode.INQUIRY:
            attrs["price_amount"] = None
            return attrs
        amount = attrs["price_amount"] if "price_amount" in attrs else getattr(self.instance, "price_amount", None)
        if not amount:
            raise serializers.ValidationError({"price_amount": "برای این نوع قیمت، مبلغ لازم است."})
        return attrs

    @staticmethod
    def _replace_features(package: Package, features: list[dict[str, Any]]) -> None:
        package.features.all().delete()
        PackageFeature.objects.bulk_create(
            PackageFeature(package=package, position=i, **data) for i, data in enumerate(features)
        )

    @transaction.atomic
    def create(self, validated_data: dict[str, Any]) -> Package:
        features = validated_data.pop("features", [])
        package: Package = super().create(validated_data)
        self._replace_features(package, features)
        return package

    @transaction.atomic
    def update(self, instance: Package, validated_data: dict[str, Any]) -> Package:
        features = validated_data.pop("features", None)
        package: Package = super().update(instance, validated_data)
        if features is not None:
            self._replace_features(package, features)
        return package


# ---- price calculator ------------------------------------------------------------------------------


class QuoteInputSerializer(serializers.Serializer):  # type: ignore[type-arg]
    """What a visitor (or the owner's preview) sends: choices only, never prices."""

    service = serializers.SlugField(max_length=40)
    quantity = serializers.IntegerField(min_value=1, max_value=100_000)
    addons = serializers.ListField(child=serializers.SlugField(max_length=40), max_length=20, default=list)
    multipliers = serializers.ListField(child=serializers.SlugField(max_length=40), max_length=20, default=list)


class QuoteEstimateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    low = serializers.IntegerField()
    high = serializers.IntegerField()
    currency = serializers.CharField()
    approximate = serializers.BooleanField()


class QuoteOptionSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = QuoteRule
        fields = ["key", "label_fa", "label_en"]
        read_only_fields = fields


class QuoteOptionsSerializer(serializers.Serializer):  # type: ignore[type-arg]
    services = QuoteOptionSerializer(many=True)
    addons = QuoteOptionSerializer(many=True)
    multipliers = QuoteOptionSerializer(many=True)
    min_quantity = serializers.IntegerField()
    max_quantity = serializers.IntegerField()


class QuotePreviewSerializer(QuoteEstimateSerializer):
    """The owner's preview also shows how the number was reached."""

    total = serializers.IntegerField()
    base = serializers.IntegerField()
    tier_factor = serializers.CharField()
    addons = serializers.ListField(child=serializers.ListField(child=serializers.CharField()))
    multipliers = serializers.ListField(child=serializers.ListField(child=serializers.CharField()))


class QuoteRuleSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = QuoteRule
        fields = [
            "id", "key", "kind", "label_fa", "label_en", "amount", "factor", "min_quantity", "is_active", "position",
        ]  # fmt: skip
        read_only_fields = ["id", "position"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        merged = {
            f: attrs.get(f, getattr(self.instance, f, None)) for f in ("kind", "amount", "factor", "min_quantity")
        }
        kind = merged["kind"]
        errors: dict[str, str] = {}
        priced = kind in (QuoteRule.Kind.SERVICE, QuoteRule.Kind.ADDON_FIXED, QuoteRule.Kind.ADDON_PER_ITEM)
        if priced and merged["amount"] is None:
            errors["amount"] = "مبلغ را وارد کنید."
        if kind == QuoteRule.Kind.TIER:
            if merged["factor"] is None:
                errors["factor"] = "ضریب را وارد کنید."
            if not merged["min_quantity"]:
                errors["min_quantity"] = "حداقل تعداد را وارد کنید."
        if kind == QuoteRule.Kind.MULTIPLIER and merged["factor"] is None:
            errors["factor"] = "ضریب را وارد کنید."
        if errors:
            raise serializers.ValidationError(errors)
        # Fields that do not belong to this kind are dropped, so a switched rule keeps no stale numbers.
        if not priced:
            attrs["amount"] = None
        if kind not in (QuoteRule.Kind.TIER, QuoteRule.Kind.MULTIPLIER):
            attrs["factor"] = None
        if kind != QuoteRule.Kind.TIER:
            attrs["min_quantity"] = None
        return attrs


class QuoteSettingsSerializer(serializers.ModelSerializer):  # type: ignore[type-arg]
    class Meta:
        model = QuoteSettings
        fields = ["range_percent", "rounding_step", "min_quantity", "max_quantity"]

    def validate(self, attrs: dict[str, Any]) -> dict[str, Any]:
        low = attrs.get("min_quantity", getattr(self.instance, "min_quantity", 1))
        high = attrs.get("max_quantity", getattr(self.instance, "max_quantity", 200))
        if low > high:
            raise serializers.ValidationError({"max_quantity": "حداکثر تعداد نباید از حداقل کمتر باشد."})
        return attrs
