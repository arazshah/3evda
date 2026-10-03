from django.urls import path

from .views import PublicPortfolioView, PublicProjectView

urlpatterns = [
    path("portfolio", PublicPortfolioView.as_view(), name="public-portfolio"),
    path("portfolio/<slug:slug>", PublicProjectView.as_view(), name="public-project"),
]
