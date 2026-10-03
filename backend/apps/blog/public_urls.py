from django.urls import path

from .sitemap import PublicSitemapView
from .views import PublicArticleListView, PublicArticleView, PublicPreviewView, PublicTaxonomyView

urlpatterns = [
    path("blog/articles", PublicArticleListView.as_view(), name="public-blog-list"),
    path("blog/articles/<str:lang>/<str:slug>/", PublicArticleView.as_view(), name="public-blog-article"),
    path("blog/taxonomy", PublicTaxonomyView.as_view(), name="public-blog-taxonomy"),
    path("blog/preview/<str:token>", PublicPreviewView.as_view(), name="public-blog-preview"),
    path("sitemap", PublicSitemapView.as_view(), name="public-sitemap"),
]
