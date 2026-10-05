from django.urls import path

from .views import LoadView, StateView, UnloadView

urlpatterns = [
    path("", StateView.as_view(), name="sample-content-state"),
    path("load/", LoadView.as_view(), name="sample-content-load"),
    path("unload/", UnloadView.as_view(), name="sample-content-unload"),
]
