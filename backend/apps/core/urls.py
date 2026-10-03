from django.urls import path
from drf_spectacular.views import SpectacularAPIView

from . import views

urlpatterns = [
    path("health/live", views.live, name="health-live"),
    path("health/ready", views.ready, name="health-ready"),
    path("schema/", SpectacularAPIView.as_view(), name="schema"),
]
