from django.urls import path

from .views import PreviewView, RetentionSettingsView, RunNowView

urlpatterns = [
    path("settings/", RetentionSettingsView.as_view(), name="retention-settings"),
    path("preview/", PreviewView.as_view(), name="retention-preview"),
    path("run/", RunNowView.as_view(), name="retention-run"),
]
