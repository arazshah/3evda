from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import ContentBlockViewSet, ContentItemViewSet, SiteSettingsView

router = SimpleRouter()
router.register("blocks", ContentBlockViewSet, basename="cms-block")
router.register("items", ContentItemViewSet, basename="cms-item")

urlpatterns = [path("settings", SiteSettingsView.as_view(), name="cms-settings"), *router.urls]
