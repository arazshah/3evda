from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import MediaViewSet, WatermarkSettingView

router = SimpleRouter()
router.register("media", MediaViewSet, basename="media")

urlpatterns = [
    path("settings/watermark", WatermarkSettingView.as_view(), name="settings-watermark"),
    *router.urls,
]
