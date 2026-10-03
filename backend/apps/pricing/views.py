from typing import Any

from django.db.models import Count, Prefetch, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.viewsets import AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin

from .models import Package, PackageGroup
from .serializers import PackageGroupSerializer, PackageSerializer, PublicGroupSerializer, PublicPackagesSerializer

PUBLIC_CACHE = "public, max-age=30"


class PublicPackagesView(APIView):
    """Published groups with their published packages; groups without packages are left out."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicPackagesSerializer, auth=[])
    def get(self, request: Request) -> Response:
        packages = Package.objects.filter(is_published=True).prefetch_related("features")
        groups = [
            g
            for g in PackageGroup.objects.filter(is_published=True).prefetch_related(
                Prefetch("packages", queryset=packages)
            )
            if g.packages.all()
        ]
        response = Response({"groups": PublicGroupSerializer(groups, many=True).data})
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class PackageGroupViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = PackageGroupSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[PackageGroup]:
        return PackageGroup.objects.annotate(package_count=Count("packages")).order_by("position", "id")


@extend_schema(parameters=[OpenApiParameter("group", int)])
class PackageViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = PackageSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Package]:
        qs = Package.objects.prefetch_related("features")
        if group := self.request.query_params.get("group"):
            qs = qs.filter(group_id=int(group))
        return qs.order_by("position", "id")
