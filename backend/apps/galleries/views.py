from typing import Any

from django.db.models import Count, Q, QuerySet, Sum
from django.db.models.functions import Coalesce
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.parsers import FormParser, MultiPartParser
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.service import record

from . import service
from .models import Gallery, GalleryPhoto
from .serializers import GalleryPhotoSerializer, GallerySerializer, PhotoOrderSerializer, PhotoUploadSerializer


def _error(error: service.GalleryError) -> Response:
    return Response({"code": error.code, "detail": error.detail}, status=error.status)


class GalleryViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    serializer_class = GallerySerializer
    http_method_names = ["get", "post", "patch", "put", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Gallery]:
        return Gallery.objects.annotate(
            photo_count=Count("photos", distinct=True),
            ready_count=Count("photos", filter=Q(photos__status=GalleryPhoto.Status.READY), distinct=True),
            usage_bytes=Coalesce(Sum("photos__size_bytes"), 0) + Coalesce(Sum("photos__stored_bytes"), 0),
        )

    def perform_create(self, serializer: Any) -> None:
        gallery = serializer.save()
        record("galleries.gallery.create", request=self.request._request, target=gallery)

    def perform_update(self, serializer: Any) -> None:
        gallery = serializer.save()
        record(
            "galleries.gallery.update",
            request=self.request._request,
            target=gallery,
            fields=sorted(k for k in serializer.validated_data if k not in ("password", "clear_password")),
            password_changed="password" in serializer.validated_data or "clear_password" in serializer.validated_data,
        )

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        gallery = self.get_object()
        record("galleries.gallery.delete", request=request._request, target=gallery)
        service.delete_gallery(gallery)
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _fresh(self, gallery: Gallery) -> Response:
        return Response(self.get_serializer(self.get_queryset().get(pk=gallery.pk)).data)

    def _transition(self, request: Request, name: str, fn: Any) -> Response:
        gallery = self.get_object()
        try:
            fn(gallery)
        except service.GalleryError as error:
            return _error(error)
        record(f"galleries.gallery.{name}", request=request._request, target=gallery)
        return self._fresh(gallery)

    @extend_schema(request=None, responses=GallerySerializer)
    @action(detail=True, methods=["post"])
    def publish(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, "publish", service.publish)

    @extend_schema(request=None, responses=GallerySerializer)
    @action(detail=True, methods=["post"])
    def reopen(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, "reopen", service.reopen)

    @extend_schema(request=None, responses=GallerySerializer)
    @action(detail=True, methods=["post"])
    def archive(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, "archive", service.archive)

    @extend_schema(request=None, responses=GallerySerializer)
    @action(detail=True, methods=["post"])
    def unarchive(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, "unarchive", service.unarchive)

    @extend_schema(request=None, responses=GallerySerializer)
    @action(detail=True, methods=["post"], url_path="new-link")
    def new_link(self, request: Request, pk: str | None = None) -> Response:
        return self._transition(request, "new_link", service.new_link)

    # ---- photos --------------------------------------------------------------------------------

    @extend_schema(
        methods=["post"],
        request={"multipart/form-data": PhotoUploadSerializer},
        responses={201: GalleryPhotoSerializer},
    )
    @extend_schema(methods=["get"], responses=GalleryPhotoSerializer(many=True))
    @action(detail=True, methods=["get", "post"], parser_classes=[MultiPartParser, FormParser])
    def photos(self, request: Request, pk: str | None = None) -> Response:
        gallery = self.get_object()
        if request.method == "GET":
            return Response(GalleryPhotoSerializer(gallery.photos.all(), many=True).data)
        body = PhotoUploadSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            photo = service.add_photo(gallery, body.validated_data["file"])
        except service.GalleryError as error:
            return _error(error)
        photo.refresh_from_db()  # the previews may already be made
        return Response(GalleryPhotoSerializer(photo).data, status=status.HTTP_201_CREATED)

    # Named so that it sorts before `remove_photo`: the router tries routes in that order, and "order" would fit its id.
    @extend_schema(request=PhotoOrderSerializer, responses={204: None})
    @action(detail=True, methods=["patch"], url_path="photos/order")
    def order_photos(self, request: Request, pk: str | None = None) -> Response:
        gallery = self.get_object()
        body = PhotoOrderSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            service.reorder(gallery, body.validated_data["ids"])
        except service.GalleryError as error:
            return _error(error)
        record("galleries.photos.reorder", request=request._request, target=gallery)
        return Response(status=status.HTTP_204_NO_CONTENT)

    @extend_schema(parameters=[OpenApiParameter("photo_id", int, OpenApiParameter.PATH)], responses={204: None})
    @action(detail=True, methods=["delete"], url_path=r"photos/(?P<photo_id>[^/.]+)")
    def remove_photo(self, request: Request, pk: str | None = None, photo_id: str | None = None) -> Response:
        gallery = self.get_object()
        raw = photo_id or ""
        wanted = int(raw) if raw.isdigit() else 0
        found = GalleryPhoto.objects.filter(gallery=gallery, pk=wanted).first()
        if found is None:
            return Response({"code": "not_found", "detail": "عکس پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        service.delete_photo(found)
        record("galleries.photo.delete", request=request._request, target=gallery, photo=wanted)
        return Response(status=status.HTTP_204_NO_CONTENT)
