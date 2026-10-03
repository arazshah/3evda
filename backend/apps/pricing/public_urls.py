from django.urls import path

from .views import PublicPackagesView, PublicQuoteEstimateView, PublicQuoteOptionsView

urlpatterns = [
    path("packages", PublicPackagesView.as_view(), name="public-packages"),
    path("quote/options", PublicQuoteOptionsView.as_view(), name="public-quote-options"),
    path("quote/estimate", PublicQuoteEstimateView.as_view(), name="public-quote-estimate"),
]
