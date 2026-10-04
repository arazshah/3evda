from django.urls import path

from .public_views import (
    PublicGalleryView,
    PublicPhotosView,
    PublicSelectionView,
    PublicSubmitView,
    PublicUnlockView,
)

urlpatterns = [
    path("galleries/<str:token>", PublicGalleryView.as_view(), name="public-gallery"),
    path("galleries/<str:token>/unlock", PublicUnlockView.as_view(), name="public-gallery-unlock"),
    path("galleries/<str:token>/photos", PublicPhotosView.as_view(), name="public-gallery-photos"),
    path(
        "galleries/<str:token>/photos/<int:photo_id>/selection",
        PublicSelectionView.as_view(),
        name="public-gallery-selection",
    ),
    path("galleries/<str:token>/submit", PublicSubmitView.as_view(), name="public-gallery-submit"),
]
