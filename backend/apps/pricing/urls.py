from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import PackageGroupViewSet, PackageViewSet, QuoteRuleViewSet, QuoteSettingsView

router = SimpleRouter()
router.register("groups", PackageGroupViewSet, basename="pricing-group")
router.register("packages", PackageViewSet, basename="pricing-package")

router.register("rules", QuoteRuleViewSet, basename="pricing-rule")

urlpatterns = [path("quote-settings", QuoteSettingsView.as_view(), name="pricing-quote-settings"), *router.urls]
