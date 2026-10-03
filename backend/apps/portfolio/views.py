from typing import Any

from django.db.models import Count, Q, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import viewsets
from rest_framework.exceptions import NotFound
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.core.viewsets import AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin

from .models import Category, Project
from .serializers import (
    CategorySerializer,
    ProjectSerializer,
    PublicCategorySerializer,
    PublicPortfolioSerializer,
    PublicProjectDetailSerializer,
    PublicProjectSerializer,
)

PUBLIC_CACHE = "public, max-age=30"


def visible_projects() -> QuerySet[Project]:
    """Published projects whose category (if any) is also published, in display order."""
    return Project.objects.filter(is_published=True).filter(Q(category__isnull=True) | Q(category__is_published=True))


def published_projects() -> QuerySet[Project]:
    """`visible_projects` with everything the cards need (category, cover and gallery media)."""
    return (
        visible_projects()
        .select_related("category", "cover")
        .prefetch_related("cover__variants", "images__media__variants")
    )


class PublicPortfolioView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            OpenApiParameter("category", str, description="Category slug"),
            OpenApiParameter("style", str, enum=[c.value for c in Project.Style]),
            OpenApiParameter("featured", bool),
        ],
        responses=PublicPortfolioSerializer,
        operation_id="public_portfolio_list",
        auth=[],
    )
    def get(self, request: Request) -> Response:
        projects = published_projects()
        params = request.query_params
        if slug := params.get("category"):
            projects = projects.filter(category__slug=slug)
        if style := params.get("style"):
            projects = projects.filter(style=style)
        featured = params.get("featured", "").lower()
        if featured in ("1", "true"):
            projects = projects.filter(is_featured=True)
        elif featured in ("0", "false"):
            projects = projects.filter(is_featured=False)
        categories = (
            Category.objects.filter(is_published=True)
            .select_related("cover")
            .prefetch_related("cover__variants")
            .annotate(project_count=Count("projects", filter=Q(projects__is_published=True)))
        )
        response = Response(
            {
                "categories": PublicCategorySerializer(categories, many=True).data,
                "projects": PublicProjectSerializer(projects, many=True).data,
            }
        )
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class PublicProjectView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicProjectDetailSerializer, operation_id="public_project_retrieve", auth=[])
    def get(self, request: Request, slug: str) -> Response:
        slugs = list(visible_projects().values_list("slug", flat=True))  # light: only the order is needed
        if slug not in slugs:
            raise NotFound
        index = slugs.index(slug)
        project = published_projects().get(slug=slug)  # only this project's gallery is loaded
        project.previous = slugs[index - 1] if index > 0 else None  # type: ignore[attr-defined]
        project.next = slugs[index + 1] if index < len(slugs) - 1 else None  # type: ignore[attr-defined]
        response = Response(PublicProjectDetailSerializer(project).data)
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class CategoryViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = CategorySerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Category]:
        return (
            Category.objects.select_related("cover")
            .prefetch_related("cover__variants")
            .annotate(project_count=Count("projects"))
            .order_by("position", "id")
        )


@extend_schema(parameters=[OpenApiParameter("category", int), OpenApiParameter("q", str)])
class ProjectViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = ProjectSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Project]:
        qs = Project.objects.select_related("cover").prefetch_related("cover__variants", "images__media__variants")
        params = self.request.query_params
        if category := params.get("category"):
            qs = qs.filter(category_id=category)
        if q := params.get("q", "").strip():
            qs = qs.filter(Q(title_fa__icontains=q) | Q(title_en__icontains=q))
        return qs.order_by("position", "-created_at", "id")
