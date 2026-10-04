from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import generics, status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.service import record

from . import service
from .models import RetentionSettings
from .serializers import (
    PreviewSerializer,
    RetentionSettingsSerializer,
    RunRequestSerializer,
    RunResultSerializer,
)


class RetentionSettingsView(generics.RetrieveUpdateAPIView):  # type: ignore[type-arg]
    serializer_class = RetentionSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self) -> RetentionSettings:
        return RetentionSettings.load()

    def perform_update(self, serializer: Any) -> None:
        serializer.save()
        record("retention.settings.update", request=self.request._request, fields=sorted(serializer.validated_data))


class PreviewView(APIView):
    """What a run would remove right now. Reads only; nothing personal is in the answer."""

    @extend_schema(responses=PreviewSerializer, operation_id="retention_preview")
    def get(self, request: Request) -> Response:
        settings = RetentionSettings.load()
        return Response({"enabled": settings.enabled, "rows": service.preview(settings=settings)})


class RunNowView(APIView):
    """Applies the rules now. Irreversible, so it needs an explicit `confirm: true`."""

    @extend_schema(request=RunRequestSerializer, responses=RunResultSerializer, operation_id="retention_run")
    def post(self, request: Request) -> Response:
        body = RunRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if body.validated_data["confirm"] is not True:
            return Response(
                {"code": "not_confirmed", "detail": "برای اجرا باید تأیید کنید."}, status=status.HTTP_400_BAD_REQUEST
            )
        return Response(service.run(request=request._request, trigger="manual"))
