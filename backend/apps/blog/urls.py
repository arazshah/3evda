from rest_framework.routers import SimpleRouter

from .views import ArticleViewSet, CategoryViewSet, TagViewSet

router = SimpleRouter()
router.register("articles", ArticleViewSet, basename="blog-article")
router.register("categories", CategoryViewSet, basename="blog-category")
router.register("tags", TagViewSet, basename="blog-tag")

urlpatterns = router.urls
