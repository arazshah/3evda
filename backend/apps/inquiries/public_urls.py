from django.urls import path

from .views import PublicInquiryView

urlpatterns = [path("inquiries", PublicInquiryView.as_view(), name="public-inquiries")]
