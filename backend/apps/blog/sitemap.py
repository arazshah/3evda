from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.portfolio.views import visible_projects

from .models import Article


class SitemapAlternate(serializers.Serializer):  # type: ignore[type-arg]
    language = serializers.CharField()
    slug = serializers.CharField()


class SitemapProject(serializers.Serializer):  # type: ignore[type-arg]
    slug = serializers.CharField()
    updated_at = serializers.DateTimeField()


class SitemapArticle(serializers.Serializer):  # type: ignore[type-arg]
    language = serializers.CharField()
    slug = serializers.CharField()
    updated_at = serializers.DateTimeField()
    alternates = SitemapAlternate(many=True)


class PublicSitemapSerializer(serializers.Serializer):  # type: ignore[type-arg]
    projects = SitemapProject(many=True)
    articles = SitemapArticle(many=True)


class PublicSitemapView(APIView):
    """Raw material for sitemap.xml: only what visitors can actually open (never drafts or scheduled)."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicSitemapSerializer, operation_id="public_sitemap_retrieve", auth=[])
    def get(self, request: Request) -> Response:
        projects = [
            {"slug": p.slug, "updated_at": p.updated_at}
            for p in visible_projects().order_by("position", "id").only("slug", "updated_at")
        ]
        visible = list(Article.objects.visible().order_by("-published_at", "-id"))
        by_group: dict[Any, list[Article]] = {}
        for article in visible:
            by_group.setdefault(article.translation_group, []).append(article)
        articles = [
            {
                "language": a.language,
                "slug": a.slug,
                "updated_at": a.updated_at,
                "alternates": [
                    {"language": other.language, "slug": other.slug}
                    for other in by_group[a.translation_group]
                    if other.pk != a.pk
                ],
            }
            for a in visible
        ]
        response = Response({"projects": projects, "articles": articles})
        response["Cache-Control"] = "public, max-age=30"
        return response
