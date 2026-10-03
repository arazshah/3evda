from typing import Any

from django.db import transaction
from rest_framework import serializers

from .models import Package, PackageFeature, PackageGroup

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
