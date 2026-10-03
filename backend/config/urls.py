from django.contrib import admin
from django.urls import include, path
from django_otp.admin import OTPAdminSite

# The Django admin is a support tool only, and requires the same second factor as the panel.
admin.site.__class__ = OTPAdminSite

urlpatterns = [
    path("api/auth/", include("apps.accounts.urls")),
    path("api/admin/cms/", include("apps.cms.urls")),
    path("api/admin/portfolio/", include("apps.portfolio.urls")),
    path("api/admin/pricing/", include("apps.pricing.urls")),
    path("api/admin/", include("apps.media.urls")),
    path("api/public/", include("apps.cms.public_urls")),
    path("api/public/", include("apps.portfolio.public_urls")),
    path("api/public/", include("apps.pricing.public_urls")),
    path("api/", include("apps.core.urls")),
    path("django-admin/", admin.site.urls),
]
