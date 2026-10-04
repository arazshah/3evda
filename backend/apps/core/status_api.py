from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import status


class CheckSerializer(serializers.Serializer[dict[str, str]]):
    key = serializers.CharField()
    label = serializers.CharField()  # type: ignore[assignment]  # the API's own name for it
    level = serializers.ChoiceField(choices=["ok", "warning", "error", "unknown"])
    detail = serializers.CharField()


class SystemStatusSerializer(serializers.Serializer[dict[str, object]]):
    level = serializers.ChoiceField(choices=["ok", "warning", "error"])
    checked_at = serializers.DateTimeField()
    version = serializers.CharField()
    checks = CheckSerializer(many=True)


class SystemStatusView(APIView):
    """Only the signed-in owner (default permission). Never cached, never contains a secret."""

    @extend_schema(responses=SystemStatusSerializer, operation_id="system_status")
    def get(self, request: Request) -> Response:
        return Response(status.collect())
