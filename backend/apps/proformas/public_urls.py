from django.urls import path

from .views import (
    PublicProformaApproveView,
    PublicProformaPdfView,
    PublicProformaRejectView,
    PublicProformaSeenView,
    PublicProformaView,
)

# The token is `<32 hex>_<signature>`.
urlpatterns = [
    path("proformas/<str:token>", PublicProformaView.as_view(), name="public-proforma"),
    path("proformas/<str:token>/seen", PublicProformaSeenView.as_view(), name="public-proforma-seen"),
    path("proformas/<str:token>/approve", PublicProformaApproveView.as_view(), name="public-proforma-approve"),
    path("proformas/<str:token>/reject", PublicProformaRejectView.as_view(), name="public-proforma-reject"),
    path("proformas/<str:token>/pdf", PublicProformaPdfView.as_view(), name="public-proforma-pdf"),
]
