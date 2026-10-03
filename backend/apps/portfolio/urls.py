from rest_framework.routers import SimpleRouter

from .views import CategoryViewSet, ProjectViewSet

router = SimpleRouter()
router.register("categories", CategoryViewSet, basename="portfolio-category")
router.register("projects", ProjectViewSet, basename="portfolio-project")

urlpatterns = router.urls
