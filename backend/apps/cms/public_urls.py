from django.urls import path

from .views import PublicSiteView

urlpatterns = [path("site", PublicSiteView.as_view(), name="public-site")]
