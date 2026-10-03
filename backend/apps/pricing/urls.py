from rest_framework.routers import SimpleRouter

from .views import PackageGroupViewSet, PackageViewSet

router = SimpleRouter()
router.register("groups", PackageGroupViewSet, basename="pricing-group")
router.register("packages", PackageViewSet, basename="pricing-package")

urlpatterns = router.urls
