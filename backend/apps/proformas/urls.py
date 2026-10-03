from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import ProformaSettingsView, ProformaViewSet

router = SimpleRouter()
router.register("", ProformaViewSet, basename="proforma")

# `settings/` must come before the router, whose detail route would otherwise read it as an id.
urlpatterns = [path("settings/", ProformaSettingsView.as_view(), name="proforma-settings"), *router.urls]
