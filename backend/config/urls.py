from django.contrib import admin
from django.urls import include, path
from django_otp.admin import OTPAdminSite

from apps.booking import urls as booking_urls

# The Django admin is a support tool only, and requires the same second factor as the panel.
admin.site.__class__ = OTPAdminSite

urlpatterns = [
    path("api/auth/", include("apps.accounts.urls")),
    path("api/admin/cms/", include("apps.cms.urls")),
    path("api/admin/portfolio/", include("apps.portfolio.urls")),
    path("api/admin/blog/", include("apps.blog.urls")),
    path("api/admin/pricing/", include("apps.pricing.urls")),
    path("api/admin/inquiries/", include("apps.inquiries.urls")),
    path("api/admin/proformas/", include("apps.proformas.urls")),
    path("api/admin/booking/", include((booking_urls.settings_urlpatterns, "booking-settings"))),
    path("api/admin/bookings/", include("apps.booking.urls")),
    path("api/admin/galleries/", include("apps.galleries.urls")),
    path("api/admin/retention/", include("apps.retention.urls")),
    path("api/admin/", include("apps.media.urls")),
    path("api/public/", include("apps.cms.public_urls")),
    path("api/public/", include("apps.portfolio.public_urls")),
    path("api/public/", include("apps.blog.public_urls")),
    path("api/public/", include("apps.pricing.public_urls")),
    path("api/public/", include("apps.inquiries.public_urls")),
    path("api/public/", include("apps.proformas.public_urls")),
    path("api/public/", include("apps.booking.public_urls")),
    path("api/public/", include("apps.galleries.public_urls")),
    path("api/", include("apps.core.urls")),
    path("django-admin/", admin.site.urls),
]
