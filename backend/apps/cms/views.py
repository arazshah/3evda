from typing import Any

from django.db import transaction
from django.db.models import QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.serializers import BaseSerializer
from rest_framework.views import APIView

from apps.audit.service import record

from .blocks import BY_KEY
from .models import ContentBlock, ContentItem, SiteSettings
from .serializers import (
    ContentBlockSerializer,
    ContentItemSerializer,
    PublicBlockSerializer,
    PublicItemSerializer,
    PublicSettingsSerializer,
    PublicSiteSerializer,
    ReorderSerializer,
    SiteSettingsSerializer,
)
from .service import ensure_blocks

PUBLIC_CACHE = "public, max-age=30"


def _with_media(qs: QuerySet[Any]) -> QuerySet[Any]:
    return qs.select_related("media").prefetch_related("media__variants")


class PublicSiteView(APIView):
    """Everything the public pages need in one cacheable response. Only published items are included."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicSiteSerializer, auth=[])
    def get(self, request: Request) -> Response:
        ensure_blocks()
        settings = (
            SiteSettings.objects.select_related("logo", "og_image")
            .prefetch_related("logo__variants", "og_image__variants")
            .get(pk=SiteSettings.load().pk)
        )
        blocks = _with_media(ContentBlock.objects.filter(key__in=BY_KEY.keys()))
        items = _with_media(ContentItem.objects.filter(is_published=True))
        collections: dict[str, list[ContentItem]] = {c.value: [] for c in ContentItem.Collection}
        for item in items:
            collections[item.collection].append(item)
        body = {
            "settings": PublicSettingsSerializer(settings).data,
            "blocks": {b.key: PublicBlockSerializer(b).data for b in blocks},
            "collections": {k: PublicItemSerializer(v, many=True).data for k, v in collections.items()},
        }
        response = Response(body)
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class SiteSettingsView(generics.RetrieveUpdateAPIView):  # type: ignore[type-arg]
    serializer_class = SiteSettingsSerializer

    def get_object(self) -> SiteSettings:
        return SiteSettings.load()

    def perform_update(self, serializer: BaseSerializer[Any]) -> None:
        serializer.save()
        record("cms.settings.update", request=self.request._request, fields=sorted(serializer.validated_data))


class ContentBlockViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    serializer_class = ContentBlockSerializer
    lookup_field = "key"
    lookup_value_regex = r"[\w.]+"
    http_method_names = ["get", "patch", "head", "options"]

    def get_queryset(self) -> QuerySet[ContentBlock]:
        ensure_blocks()
        return _with_media(ContentBlock.objects.filter(key__in=BY_KEY.keys()))

    def list(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        order = {key: i for i, key in enumerate(BY_KEY)}  # registry order keeps the groups together
        blocks = sorted(self.get_queryset(), key=lambda b: order[b.key])
        return Response(self.get_serializer(blocks, many=True).data)

    def perform_update(self, serializer: BaseSerializer[Any]) -> None:
        block = serializer.save()
        record(
            "cms.block.update", request=self.request._request, target=block, fields=sorted(serializer.validated_data)
        )


@extend_schema(parameters=[OpenApiParameter("collection", str, enum=[c.value for c in ContentItem.Collection])])
class ContentItemViewSet(viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = ContentItemSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[ContentItem]:
        qs = _with_media(ContentItem.objects.all())
        if collection := self.request.query_params.get("collection"):
            qs = qs.filter(collection=collection)
        return qs

    def perform_create(self, serializer: BaseSerializer[Any]) -> None:
        collection = serializer.validated_data["collection"]
        last = ContentItem.objects.filter(collection=collection).order_by("-position").first()
        item = serializer.save(position=(last.position + 1) if last else 0)
        record("cms.item.create", request=self.request._request, target=item, collection=item.collection)

    def perform_update(self, serializer: BaseSerializer[Any]) -> None:
        item = serializer.save()
        record("cms.item.update", request=self.request._request, target=item, fields=sorted(serializer.validated_data))

    def perform_destroy(self, instance: ContentItem) -> None:
        collection, pk = instance.collection, instance.pk
        instance.delete()
        record("cms.item.delete", request=self.request._request, collection=collection, item_id=pk)

    @extend_schema(request=ReorderSerializer, responses={204: None})
    @action(detail=False, methods=["post"])
    def reorder(self, request: Request) -> Response:
        data = ReorderSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        collection, ids = data.validated_data["collection"], data.validated_data["ids"]
        items = {i.pk: i for i in ContentItem.objects.filter(collection=collection)}
        if set(ids) != set(items) or len(ids) != len(items):
            return Response(
                {"code": "bad_order", "detail": "فهرست باید دقیقاً همه‌ی آیتم‌های این بخش را یک‌بار شامل شود."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            for position, pk in enumerate(ids):
                ContentItem.objects.filter(pk=pk).update(position=position)
        record("cms.item.reorder", request=request._request, collection=collection, count=len(ids))
        return Response(status=status.HTTP_204_NO_CONTENT)
