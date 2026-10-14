from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import MediaViewSet, WatermarkApplyView, WatermarkPreviewView, WatermarkSettingView

router = SimpleRouter()
router.register("media", MediaViewSet, basename="media")

urlpatterns = [
    path("settings/watermark", WatermarkSettingView.as_view(), name="settings-watermark"),
    path("settings/watermark/preview", WatermarkPreviewView.as_view(), name="settings-watermark-preview"),
    path("settings/watermark/apply", WatermarkApplyView.as_view(), name="settings-watermark-apply"),
    *router.urls,
]
