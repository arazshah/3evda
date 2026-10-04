from django.urls import path
from rest_framework.routers import SimpleRouter

from .views import (
    BookingSettingsView,
    BookingViewSet,
    ClosedPeriodViewSet,
    SessionTypeViewSet,
    WeeklyHoursView,
)

settings_router = SimpleRouter()
settings_router.register("session-types", SessionTypeViewSet, basename="booking-session-type")
settings_router.register("closed", ClosedPeriodViewSet, basename="booking-closed")

bookings_router = SimpleRouter()
bookings_router.register("", BookingViewSet, basename="booking")

# /api/admin/booking/ (settings) and /api/admin/bookings/ (the bookings themselves)
settings_urlpatterns = [
    path("hours/", WeeklyHoursView.as_view(), name="booking-hours"),
    path("settings/", BookingSettingsView.as_view(), name="booking-settings"),
    *settings_router.urls,
]
urlpatterns = bookings_router.urls
