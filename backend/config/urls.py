from django.contrib import admin
from django.urls import include, path
from django_otp.admin import OTPAdminSite

# The Django admin is a support tool only, and requires the same second factor as the panel.
admin.site.__class__ = OTPAdminSite

urlpatterns = [
    path("api/auth/", include("apps.accounts.urls")),
    path("api/", include("apps.core.urls")),
    path("django-admin/", admin.site.urls),
]
