import io
from typing import Any
from urllib.parse import quote, urlsplit

from django.db import transaction
from django.db.models import Count, Q, QuerySet
from django.db.models.deletion import ProtectedError
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.parsers import JSONParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from apps.audit.service import record

from .images import apply_watermark, sample_photo
from .models import MediaAsset, WatermarkSetting
from .serializers import MediaAssetSerializer, MediaUploadSerializer, WatermarkSettingSerializer
from .service import create_asset, delete_asset
from .storage import private_storage
from .validation import UploadRejected

ORIGINAL_URL_TTL = 60
SIGNED_PREFIX = "/storage-signed"


class MediaPagination(PageNumberPagination):
    page_size = 40
    max_page_size = 100
    page_size_query_param = "page_size"


@extend_schema(
    parameters=[
        OpenApiParameter("q", str, description="Search title, file name and alt texts"),
        OpenApiParameter("kind", str, enum=[c.value for c in MediaAsset.Kind]),
        OpenApiParameter("status", str, enum=[c.value for c in MediaAsset.Status]),
    ]
)
class MediaViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    serializer_class = MediaAssetSerializer
    pagination_class = MediaPagination
    parser_classes = [JSONParser, MultiPartParser]
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[MediaAsset]:
        qs = (
            MediaAsset.objects.prefetch_related("variants")
            .annotate(usage_count=Count("references"))
            .order_by("-created_at", "id")  # annotate() drops Meta.ordering
        )
        params = self.request.query_params
        if q := params.get("q", "").strip():
            qs = qs.filter(
                Q(title__icontains=q)
                | Q(original_filename__icontains=q)
                | Q(alt_fa__icontains=q)
                | Q(alt_en__icontains=q)
            )
        if kind := params.get("kind"):
            qs = qs.filter(kind=kind)
        if state := params.get("status"):
            qs = qs.filter(status=state)
        return qs

    @extend_schema(
        request={"multipart/form-data": MediaUploadSerializer},
        responses={201: MediaAssetSerializer, 200: MediaAssetSerializer},
    )
    def create(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        data = MediaUploadSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        try:
            asset, created = create_asset(data.validated_data["file"], user=request.user)
        except UploadRejected as exc:
            return Response({"code": exc.code, "detail": exc.message}, status=status.HTTP_400_BAD_REQUEST)
        if created:
            record("media.upload", request=request._request, target=asset, filename=asset.original_filename,
                   size=asset.size_bytes)  # fmt: skip
        asset = self.get_queryset().get(pk=asset.pk)
        return Response(
            self.get_serializer(asset).data, status=status.HTTP_201_CREATED if created else status.HTTP_200_OK
        )

    def perform_update(self, serializer: BaseSerializer[Any]) -> None:
        asset = serializer.save()
        record("media.update", request=self.request._request, target=asset, fields=sorted(serializer.validated_data))

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        asset = self.get_object()
        try:
            delete_asset(asset)
        except ProtectedError:
            return Response(
                {"code": "in_use", "detail": "این فایل در سایت استفاده شده است؛ ابتدا آن را از آن‌جا بردارید."},
                status=status.HTTP_409_CONFLICT,
            )
        record("media.delete", request=request._request, filename=asset.original_filename, asset_id=str(kwargs["pk"]))
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(responses={302: None}, description="Redirects to a 60-second signed download via the gateway.")
    @action(detail=True, methods=["get"], url_path="original")
    def original(self, request: Request, pk: str | None = None) -> HttpResponse:
        asset = self.get_object()
        disposition = f"attachment; filename*=UTF-8''{quote(asset.original_filename)}"
        signed = urlsplit(
            private_storage().url(
                asset.original_key, parameters={"ResponseContentDisposition": disposition}, expire=ORIGINAL_URL_TTL
            )
        )
        # The gateway forwards /storage-signed/<bucket>/<key>?<signature> verbatim to the storage
        # service, which validates the signature. Only the signature, never a credential, leaves the server.
        response = HttpResponse(status=302)
        response["Location"] = f"{SIGNED_PREFIX}{signed.path}?{signed.query}"
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        record("media.download_original", request=request._request, target=asset)
        return response

    @extend_schema(request=None, responses={202: MediaAssetSerializer})
    @action(detail=True, methods=["post"])
    def reprocess(self, request: Request, pk: str | None = None) -> Response:
        from .tasks import process_asset

        asset = self.get_object()
        MediaAsset.objects.filter(pk=asset.pk).update(status=MediaAsset.Status.PENDING)
        transaction.on_commit(lambda: process_asset.delay(str(asset.pk)))
        record("media.reprocess", request=request._request, target=asset)
        asset.refresh_from_db()
        return Response(self.get_serializer(self.get_queryset().get(pk=asset.pk)).data, status=status.HTTP_202_ACCEPTED)


WATERMARK_FIELDS = ("enabled", "text", "opacity", "position", "size_ratio")


class WatermarkSettingView(APIView):
    @extend_schema(responses=WatermarkSettingSerializer)
    def get(self, request: Request) -> Response:
        return Response(WatermarkSettingSerializer(WatermarkSetting.load()).data)

    @extend_schema(request=WatermarkSettingSerializer, responses=WatermarkSettingSerializer)
    def put(self, request: Request) -> Response:
        from .tasks import reapply_watermark

        current = WatermarkSetting.load()
        before = {name: getattr(current, name) for name in WATERMARK_FIELDS}
        serializer = WatermarkSettingSerializer(current, data=request.data)
        serializer.is_valid(raise_exception=True)
        serializer.save()
        record("settings.watermark", request=request._request, enabled=serializer.validated_data.get("enabled"))
        # A changed look applies to the photos already on the site, not only to the next uploads.
        if any(getattr(current, name) != value for name, value in before.items()):
            transaction.on_commit(reapply_watermark.delay)
        return Response(serializer.data)


class WatermarkPreviewView(APIView):
    """A made-up photo stamped with the given, unsaved settings: what you see is what the worker makes."""

    @extend_schema(request=WatermarkSettingSerializer, responses={(200, "image/png"): bytes})
    def post(self, request: Request) -> HttpResponse:
        serializer = WatermarkSettingSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        setting = WatermarkSetting(**{name: serializer.validated_data[name] for name in WATERMARK_FIELDS})
        buffer = io.BytesIO()
        apply_watermark(sample_photo(), setting).save(buffer, "PNG")
        response = HttpResponse(buffer.getvalue(), content_type="image/png")
        response["Cache-Control"] = "no-store"
        return response


class WatermarkApplyView(APIView):
    """Re-make every finished photo with the current watermark settings (the button under the settings)."""

    @extend_schema(request=None, responses={202: WatermarkSettingSerializer})
    def post(self, request: Request) -> Response:
        from .tasks import reapply_watermark

        transaction.on_commit(reapply_watermark.delay)
        record("media.watermark_apply", request=request._request)
        return Response(WatermarkSettingSerializer(WatermarkSetting.load()).data, status=status.HTTP_202_ACCEPTED)
