from rest_framework import serializers

from .models import RetentionSettings


class RetentionSettingsSerializer(serializers.ModelSerializer[RetentionSettings]):
    class Meta:
        model = RetentionSettings
        fields = [
            "enabled",
            "inquiry_months",
            "booking_months",
            "gallery_days",
            "proforma_months",
            "last_run_at",
            "last_run",
            "updated_at",
        ]
        read_only_fields = ["last_run_at", "last_run", "updated_at"]


class PreviewRowSerializer(serializers.Serializer[dict[str, object]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # the API's own name for it
    action = serializers.ChoiceField(choices=["anonymise", "delete"])
    count = serializers.IntegerField()
    oldest = serializers.DateTimeField(allow_null=True)


class PreviewSerializer(serializers.Serializer[dict[str, object]]):
    enabled = serializers.BooleanField()
    rows = PreviewRowSerializer(many=True)


class RunRequestSerializer(serializers.Serializer[dict[str, object]]):
    confirm = serializers.BooleanField()


class RunResultSerializer(serializers.Serializer[dict[str, object]]):
    enabled = serializers.BooleanField()
    trigger = serializers.CharField()
    counts = serializers.DictField(child=serializers.IntegerField())
