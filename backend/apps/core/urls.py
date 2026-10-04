from django.urls import path
from drf_spectacular.views import SpectacularAPIView

from . import status_api, views

urlpatterns = [
    path("health/live", views.live, name="health-live"),
    path("health/ready", views.ready, name="health-ready"),
    path("admin/system/status", status_api.SystemStatusView.as_view(), name="system-status"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]
