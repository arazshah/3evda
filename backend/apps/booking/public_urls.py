from django.urls import path

from .views import (
    PublicAvailabilityView,
    PublicBookingCancelView,
    PublicBookingCreateView,
    PublicBookingView,
    PublicOptionsView,
)

urlpatterns = [
    path("booking/options", PublicOptionsView.as_view(), name="public-booking-options"),
    path("booking/availability", PublicAvailabilityView.as_view(), name="public-booking-availability"),
    path("bookings", PublicBookingCreateView.as_view(), name="public-bookings"),
    path("bookings/<str:token>", PublicBookingView.as_view(), name="public-booking"),
    path("bookings/<str:token>/cancel", PublicBookingCancelView.as_view(), name="public-booking-cancel"),
]
