from django.urls import path

from .public_views import (
    PublicFinalDownloadView,
    PublicFinalsView,
    PublicGalleryView,
    PublicPhotoDownloadView,
    PublicPhotosView,
    PublicSelectionView,
    PublicSubmitView,
    PublicUnlockView,
    PublicZipCreateView,
    PublicZipView,
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
    path(
        "galleries/<str:token>/photos/<int:photo_id>/download",
        PublicPhotoDownloadView.as_view(),
        name="public-gallery-photo-download",
    ),
    path("galleries/<str:token>/zip", PublicZipCreateView.as_view(), name="public-gallery-zip"),
    path("galleries/<str:token>/zip/<int:job_id>", PublicZipView.as_view(), name="public-gallery-zip-job"),
    path("galleries/<str:token>/finals", PublicFinalsView.as_view(), name="public-gallery-finals"),
    path(
        "galleries/<str:token>/finals/<int:final_id>/download",
        PublicFinalDownloadView.as_view(),
        name="public-gallery-final-download",
    ),
]
