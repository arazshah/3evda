from typing import Any

from django.db.models import QuerySet
from django.http import HttpResponse
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.service import record
from apps.inquiries.models import Inquiry

from . import service
from .links import find_by_token
from .models import Proforma, ProformaSettings
from .pdf import render_pdf
from .serializers import (
    ProformaFromInquirySerializer,
    ProformaListSerializer,
    ProformaSerializer,
    ProformaSettingsSerializer,
    PublicProformaSerializer,
    RejectSerializer,
    public_data,
)

NO_STORE = "no-store"


def _error(error: service.ProformaError) -> Response:
    return Response({"code": error.code, "detail": error.detail}, status=error.status)


def _pdf_response(proforma: Proforma) -> HttpResponse:
    response = HttpResponse(render_pdf(proforma), content_type="application/pdf")
    name = (proforma.number or f"draft-{proforma.pk}").replace("/", "-")
    response["Content-Disposition"] = f'attachment; filename="proforma-{name}.pdf"'
    response["Cache-Control"] = NO_STORE
    return response


# ---- owner -----------------------------------------------------------------------------------------


class ProformaPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


@extend_schema(parameters=[OpenApiParameter("status", str), OpenApiParameter("q", str)])
class ProformaViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.CreateModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    pagination_class = ProformaPagination
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_serializer_class(self) -> Any:
        return ProformaListSerializer if self.action == "list" else ProformaSerializer

    def get_queryset(self) -> QuerySet[Proforma]:
        qs = Proforma.objects.select_related("replaces")
        if self.action == "list":
            params = self.request.query_params
            if value := params.get("status"):
                if value == service.EXPIRED:
                    from django.utils import timezone

                    qs = qs.filter(
                        status__in=[Proforma.Status.SENT, Proforma.Status.VIEWED], valid_until__lt=timezone.localdate()
                    )
                else:
                    qs = qs.filter(status=value)
            if q := (params.get("q") or "").strip():
                from django.db.models import Q

                qs = qs.filter(
                    Q(number__icontains=q) | Q(customer_name__icontains=q) | Q(customer_company__icontains=q)
                )
            return qs
        return qs.prefetch_related("items")

    def perform_create(self, serializer: Any) -> None:
        proforma = serializer.save()
        record("proformas.proforma.create", request=self.request._request, target=proforma)

    def perform_update(self, serializer: Any) -> None:
        proforma = serializer.save()
        record(
            "proformas.proforma.update",
            request=self.request._request,
            target=proforma,
            fields=sorted(serializer.validated_data),
        )

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        proforma = self.get_object()
        if proforma.status != Proforma.Status.DRAFT:
            return Response(
                {"code": "not_draft", "detail": "فقط پیش‌نویس را می‌توان حذف کرد؛ پیش‌فاکتور صادرشده را لغو کنید."},
                status=status.HTTP_409_CONFLICT,
            )
        record("proformas.proforma.delete", request=request._request, target=proforma)
        proforma.delete()
        return Response(status=status.HTTP_204_NO_CONTENT)

    def _act(self, fn: Any, *args: Any) -> Response:
        try:
            proforma = fn(*args)
        except service.ProformaError as error:
            return _error(error)
        return Response(ProformaSerializer(Proforma.objects.prefetch_related("items").get(pk=proforma.pk)).data)

    @extend_schema(request=None, responses=ProformaSerializer)
    @action(detail=True, methods=["post"])
    def issue(self, request: Request, pk: str | None = None) -> Response:
        proforma = self.get_object()
        return self._act(service.issue, proforma.pk, request._request)

    @extend_schema(request=None, responses=ProformaSerializer)
    @action(detail=True, methods=["post"])
    def revise(self, request: Request, pk: str | None = None) -> Response:
        return self._act(service.revise, self.get_object(), request._request)

    @extend_schema(request=None, responses=ProformaSerializer)
    @action(detail=True, methods=["post"], url_path="new-link")
    def new_link(self, request: Request, pk: str | None = None) -> Response:
        return self._act(service.new_link, self.get_object(), request._request)

    @extend_schema(request=None, responses=ProformaSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        return self._act(service.cancel, self.get_object(), request._request)

    @extend_schema(responses={(200, "application/pdf"): bytes}, operation_id="proformas_pdf")
    @action(detail=True, methods=["get"])
    def pdf(self, request: Request, pk: str | None = None) -> HttpResponse:
        return _pdf_response(self.get_object())

    @extend_schema(
        request=ProformaFromInquirySerializer,
        responses={201: ProformaSerializer},
        operation_id="proformas_from_inquiry",
    )
    @action(detail=False, methods=["post"], url_path="from-inquiry")
    def from_inquiry(self, request: Request) -> Response:
        """A draft prefilled from an enquiry."""
        body = ProformaFromInquirySerializer(data=request.data)
        body.is_valid(raise_exception=True)
        inquiry = Inquiry.objects.filter(pk=body.validated_data["inquiry"]).first()
        if inquiry is None:
            return Response({"code": "no_inquiry", "detail": "این استعلام پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        proforma = service.from_inquiry(inquiry, body.validated_data.get("language"))
        record("proformas.proforma.create", request=request._request, target=proforma, inquiry=inquiry.pk)
        return Response(
            ProformaSerializer(Proforma.objects.prefetch_related("items").get(pk=proforma.pk)).data,
            status=status.HTTP_201_CREATED,
        )


class ProformaSettingsView(generics.RetrieveUpdateAPIView):  # type: ignore[type-arg]
    serializer_class = ProformaSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self) -> ProformaSettings:
        return ProformaSettings.load()

    def perform_update(self, serializer: Any) -> None:
        serializer.save()
        record("proformas.settings.update", request=self.request._request, fields=sorted(serializer.validated_data))


# ---- the customer ----------------------------------------------------------------------------------


class _PublicBase(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "proforma"

    def _find(self, token: str) -> Proforma | None:
        return find_by_token(token)

    @staticmethod
    def _missing() -> Response:
        # One answer for "never existed", "wrong signature" and "link replaced": nothing to tell apart.
        response = Response({"code": "not_found", "detail": "این لینک معتبر نیست."}, status=status.HTTP_404_NOT_FOUND)
        response["Cache-Control"] = NO_STORE
        return response

    @staticmethod
    def _data(proforma: Proforma, code: int = 200) -> Response:
        response = Response(public_data(proforma), status=code)
        response["Cache-Control"] = NO_STORE
        return response


class PublicProformaView(_PublicBase):
    @extend_schema(responses=PublicProformaSerializer, operation_id="public_proformas_retrieve", auth=[])
    def get(self, request: Request, token: str) -> Response:
        """Reading never changes anything: link checkers and previews must not mark a proforma «seen»."""
        proforma = self._find(token)
        if proforma is None:
            return self._missing()
        return self._data(Proforma.objects.prefetch_related("items").get(pk=proforma.pk))


class PublicProformaSeenView(_PublicBase):
    @extend_schema(request=None, responses=PublicProformaSerializer, operation_id="public_proformas_seen", auth=[])
    def post(self, request: Request, token: str) -> Response:
        proforma = self._find(token)
        if proforma is None:
            return self._missing()
        service.mark_seen(proforma)
        return self._data(Proforma.objects.prefetch_related("items").get(pk=proforma.pk))


class PublicProformaApproveView(_PublicBase):
    @extend_schema(request=None, responses=PublicProformaSerializer, operation_id="public_proformas_approve", auth=[])
    def post(self, request: Request, token: str) -> Response:
        proforma = self._find(token)
        if proforma is None:
            return self._missing()
        try:
            done = service.approve(proforma, request._request)
        except service.ProformaError as error:
            return _error(error)
        return self._data(Proforma.objects.prefetch_related("items").get(pk=done.pk))


class PublicProformaRejectView(_PublicBase):
    @extend_schema(
        request=RejectSerializer, responses=PublicProformaSerializer, operation_id="public_proformas_reject", auth=[]
    )
    def post(self, request: Request, token: str) -> Response:
        proforma = self._find(token)
        if proforma is None:
            return self._missing()
        body = RejectSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            done = service.reject(proforma, request._request, body.validated_data["reason"])
        except service.ProformaError as error:
            return _error(error)
        return self._data(Proforma.objects.prefetch_related("items").get(pk=done.pk))


class PublicProformaPdfView(_PublicBase):
    @extend_schema(responses={(200, "application/pdf"): bytes}, operation_id="public_proformas_pdf", auth=[])
    def get(self, request: Request, token: str) -> HttpResponse | Response:
        proforma = self._find(token)
        if proforma is None:
            return self._missing()
        return _pdf_response(Proforma.objects.prefetch_related("items").get(pk=proforma.pk))
