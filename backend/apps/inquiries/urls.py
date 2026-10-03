from rest_framework.routers import SimpleRouter

from .views import InquiryViewSet

router = SimpleRouter()
router.register("", InquiryViewSet, basename="inquiry")

urlpatterns = router.urls
