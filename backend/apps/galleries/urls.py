from rest_framework.routers import SimpleRouter

from .views import GalleryViewSet

router = SimpleRouter()
router.register("", GalleryViewSet, basename="gallery")

urlpatterns = router.urls
