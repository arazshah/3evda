from rest_framework import serializers


class SampleStateSerializer(serializers.Serializer[dict[str, object]]):
    status = serializers.ChoiceField(choices=["empty", "loading", "loaded", "unloading", "failed"])
    message = serializers.CharField()
    counts = serializers.DictField(child=serializers.IntegerField())
    result = serializers.DictField(child=serializers.IntegerField())
    updated_at = serializers.DateTimeField()


class ConfirmSerializer(serializers.Serializer[dict[str, object]]):
    confirm = serializers.BooleanField()
