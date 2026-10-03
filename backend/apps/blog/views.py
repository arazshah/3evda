from typing import Any

from django.db.models import Count, Q, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema, inline_serializer
from rest_framework import serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from apps.audit.service import record
from apps.core.viewsets import GuardedDeleteMixin

from . import service
from .cache import cached
from .models import Article, Category, Language, Tag
from .serializers import (
    ArticleSerializer,
    BlogCategorySerializer,
    BlogTagSerializer,
    PublicBlogArticleDetailSerializer,
    PublicBlogArticleSerializer,
    PublicBlogCategorySerializer,
    PublicBlogTagSerializer,
    article_from_token,
    other_language,
    preview_token,
)

PAGE_SIZE = 9
LANG_PARAM = OpenApiParameter("lang", str, enum=[c.value for c in Language], required=True)
BAD_LANGUAGE = {"code": "bad_language", "detail": "پارامتر lang باید fa یا en باشد."}


def _language(request: Request) -> str | None:
    lang = request.query_params.get("lang", "")
    return lang if lang in Language.values else None


def _listing(language: str) -> QuerySet[Article]:
    return (
        Article.objects.visible()
        .filter(language=language)
        .select_related("category", "cover")
        .prefetch_related("tags", "cover__variants")
        .order_by("-published_at", "-id")
    )


class PublicPagination(PageNumberPagination):
    page_size = PAGE_SIZE


class PublicArticleListView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[
            LANG_PARAM,
            OpenApiParameter("category", str, description="Category slug"),
            OpenApiParameter("tag", str, description="Tag slug"),
            OpenApiParameter("page", int),
        ],
        responses=inline_serializer(
            "PublicBlogArticlePage",
            {
                "count": serializers.IntegerField(),
                "page": serializers.IntegerField(),
                "pages": serializers.IntegerField(),
                "results": PublicBlogArticleSerializer(many=True),
            },
        ),
        operation_id="public_blog_articles_list",
        auth=[],
    )
    def get(self, request: Request) -> Response:
        language = _language(request)
        if language is None:
            return Response(BAD_LANGUAGE, status=status.HTTP_400_BAD_REQUEST)

        def build() -> dict[str, Any]:
            qs = _listing(language)
            params = request.query_params
            if category := params.get("category"):
                qs = qs.filter(category__slug=category)
            if tag := params.get("tag"):
                qs = qs.filter(tags__slug=tag)
            paginator = PublicPagination()
            page = paginator.paginate_queryset(qs, request, view=self) or []
            return {
                "count": paginator.page.paginator.count if paginator.page else 0,
                "page": paginator.page.number if paginator.page else 1,
                "pages": paginator.page.paginator.num_pages if paginator.page else 1,
                "results": PublicBlogArticleSerializer(page, many=True).data,
            }

        return Response(cached(request.get_full_path(), build))


def _with_neighbours(article: Article) -> Article:
    """`previous` is the article published just before this one, `next` the one just after."""
    visible = Article.objects.visible().filter(language=article.language)
    marker = article.published_at
    older = visible.filter(Q(published_at__lt=marker) | Q(published_at=marker, pk__lt=article.pk)).order_by(
        "-published_at", "-pk"
    )
    newer = visible.filter(Q(published_at__gt=marker) | Q(published_at=marker, pk__gt=article.pk)).order_by(
        "published_at", "pk"
    )
    article.previous = getattr(older.first(), "slug", None)  # type: ignore[attr-defined]
    article.next = getattr(newer.first(), "slug", None)  # type: ignore[attr-defined]
    return article


def _detail(article: Article) -> dict[str, Any]:
    if article.published_at is not None:
        _with_neighbours(article)
    else:
        article.previous = article.next = None  # type: ignore[attr-defined]
    return dict(PublicBlogArticleDetailSerializer(article).data)


class PublicArticleView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        responses={
            200: PublicBlogArticleDetailSerializer,
            301: inline_serializer("ArticleMoved", {"slug": serializers.CharField()}),
        },
        operation_id="public_blog_article_retrieve",
        auth=[],
    )
    def get(self, request: Request, lang: str, slug: str) -> Response:
        if lang not in Language.values:
            return Response(BAD_LANGUAGE, status=status.HTTP_400_BAD_REQUEST)

        def build() -> dict[str, Any] | None:
            article = (
                Article.objects.visible()
                .filter(language=lang, slug=slug)
                .select_related("category", "cover", "og_image")
                .prefetch_related("tags", "cover__variants", "og_image__variants")
                .first()
            )
            if article is not None:
                return _detail(article)
            moved = Article.objects.visible().filter(language=lang, redirects__old_slug=slug).first()
            return {"moved_to": moved.slug} if moved else None

        # None (not found) is not cached: `cached` treats it as a miss and rebuilds, which is cheap.
        data = cached(request.get_full_path(), build)
        if data is None:
            return Response({"code": "not_found", "detail": "مقاله پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        if "moved_to" in data:
            response = Response({"slug": data["moved_to"]}, status=status.HTTP_301_MOVED_PERMANENTLY)
            response["Location"] = f"/api/public/blog/articles/{lang}/{data['moved_to']}/"
            return response
        return Response(data)


class PublicPreviewView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicBlogArticleDetailSerializer, operation_id="public_blog_preview_retrieve", auth=[])
    def get(self, request: Request, token: str) -> Response:
        article = article_from_token(token)
        if article is None:
            return Response({"code": "not_found", "detail": "پیوند پیش‌نمایش نامعتبر یا منقضی است."}, status=404)
        response = Response(_detail(article))
        response["Cache-Control"] = "no-store"
        return response


class BlogTaxonomyItem(serializers.Serializer):  # type: ignore[type-arg]
    slug = serializers.CharField()
    title_fa = serializers.CharField()
    title_en = serializers.CharField()
    count = serializers.IntegerField()


class PublicTaxonomyView(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(
        parameters=[LANG_PARAM],
        responses=inline_serializer(
            "PublicBlogTaxonomy", {"categories": BlogTaxonomyItem(many=True), "tags": BlogTaxonomyItem(many=True)}
        ),
        operation_id="public_blog_taxonomy_retrieve",
        auth=[],
    )
    def get(self, request: Request) -> Response:
        language = _language(request)
        if language is None:
            return Response(BAD_LANGUAGE, status=status.HTTP_400_BAD_REQUEST)

        def build() -> dict[str, Any]:
            now_visible = Q(articles__status=Article.Status.PUBLISHED, articles__language=language)
            from django.utils import timezone

            now_visible &= Q(articles__published_at__lte=timezone.now())
            categories = Category.objects.annotate(count=Count("articles", filter=now_visible)).filter(count__gt=0)
            tags = Tag.objects.annotate(count=Count("articles", filter=now_visible)).filter(count__gt=0)
            return {
                "categories": [{**PublicBlogCategorySerializer(c).data, "count": c.count} for c in categories],
                "tags": [{**PublicBlogTagSerializer(t).data, "count": t.count} for t in tags],
            }

        return Response(cached(request.get_full_path(), build))


# ---- the owner -------------------------------------------------------------------------------------


@extend_schema(
    parameters=[
        OpenApiParameter("status", str, enum=[s.value for s in Article.Status]),
        OpenApiParameter("language", str, enum=[c.value for c in Language]),
        OpenApiParameter("category", int),
        OpenApiParameter("q", str),
    ]
)
class ArticleViewSet(GuardedDeleteMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = ArticleSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Article]:
        qs = Article.objects.select_related("category", "cover", "og_image").prefetch_related(
            "tags", "related_projects", "cover__variants", "og_image__variants"
        )
        params = self.request.query_params
        if value := params.get("status"):
            qs = qs.filter(status=value)
        if value := params.get("language"):
            qs = qs.filter(language=value)
        if value := params.get("category"):
            qs = qs.filter(category_id=value)
        if q := params.get("q", "").strip():
            qs = qs.filter(Q(title__icontains=q) | Q(summary__icontains=q))
        return qs.order_by("-updated_at", "-id")

    def perform_create(self, serializer: Any) -> None:
        article = serializer.save()
        record("blog.article.create", request=self.request._request, target=article)

    def perform_update(self, serializer: Any) -> None:
        article = serializer.save()
        record(
            "blog.article.update",
            request=self.request._request,
            target=article,
            fields=sorted(serializer.validated_data),
        )

    @extend_schema(
        request=None,
        responses=inline_serializer(
            "PreviewLink", {"token": serializers.CharField(), "expires_in": serializers.IntegerField()}
        ),
    )
    @action(detail=True, methods=["post"], url_path="preview-link")
    def preview_link(self, request: Request, pk: str | None = None) -> Response:
        from .serializers import PREVIEW_MAX_AGE

        article = self.get_object()
        record("blog.article.preview_link", request=request._request, target=article)
        return Response({"token": preview_token(article), "expires_in": PREVIEW_MAX_AGE})

    @extend_schema(request=None, responses={201: ArticleSerializer})
    @action(detail=True, methods=["post"])
    def translate(self, request: Request, pk: str | None = None) -> Response:
        """A draft copy in the other language, in the same translation group."""
        source = self.get_object()
        language = other_language(source.language)
        if Article.objects.filter(translation_group=source.translation_group, language=language).exists():
            return Response(
                {"code": "translation_exists", "detail": "نسخه‌ی این زبان قبلاً ساخته شده است."},
                status=status.HTTP_409_CONFLICT,
            )
        copy = Article(
            language=language,
            translation_group=source.translation_group,
            slug=service.make_slug(source.title, language),
            title=source.title,
            summary=source.summary,
            body=source.body,
            cover=source.cover,
            category=source.category,
            reading_minutes=source.reading_minutes,
        )
        copy.save()
        copy.tags.set(source.tags.all())
        copy.related_projects.set(source.related_projects.all())
        record("blog.article.translate", request=request._request, target=copy, source=source.pk)
        return Response(ArticleSerializer(copy).data, status=status.HTTP_201_CREATED)


class CategoryViewSet(GuardedDeleteMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = BlogCategorySerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Category]:
        return Category.objects.annotate(article_count=Count("articles")).order_by("title_fa", "id")

    def perform_create(self, serializer: Any) -> None:
        record("blog.category.create", request=self.request._request, target=serializer.save())

    def perform_update(self, serializer: Any) -> None:
        record("blog.category.update", request=self.request._request, target=serializer.save())


class TagViewSet(GuardedDeleteMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = BlogTagSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Tag]:
        return Tag.objects.annotate(article_count=Count("articles")).order_by("title_fa", "id")

    def perform_create(self, serializer: Any) -> None:
        record("blog.tag.create", request=self.request._request, target=serializer.save())

    def perform_update(self, serializer: Any) -> None:
        record("blog.tag.update", request=self.request._request, target=serializer.save())
