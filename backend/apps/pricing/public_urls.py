from django.urls import path

from .views import PublicPackagesView

urlpatterns = [path("packages", PublicPackagesView.as_view(), name="public-packages")]
