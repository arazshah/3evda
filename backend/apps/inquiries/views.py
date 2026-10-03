from datetime import date
from typing import Any
from urllib.parse import quote, urlsplit

from django.db.models import Count, Q, QuerySet
from django.http import HttpResponse
from django.utils import timezone, translation
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.service import record
from apps.core.viewsets import GuardedDeleteMixin
from apps.media.storage import private_storage
from apps.pricing.quote import QuoteError

from . import attachments
from .exports import to_csv
from .messages import t
from .models import Inquiry, InquiryAttachment, InquiryStatusChange
from .serializers import (
    InquiryCreateSerializer,
    InquiryListSerializer,
    InquiryReceivedSerializer,
    InquirySerializer,
    InquirySummarySerializer,
)
from .service import create_inquiry

SIGNED_PREFIX = "/storage-signed"
DOWNLOAD_TTL = 60
EXPORT_LIMIT = 5000


class PublicInquiryView(APIView):
    """Anyone can send an enquiry; spam is limited by a rate limit, a honeypot field and strict file checks."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "inquiry"

    @extend_schema(
        request=InquiryCreateSerializer,
        responses={201: InquiryReceivedSerializer},
        operation_id="public_inquiries_create",
        auth=[],
    )
    def post(self, request: Request) -> Response:
        # A request far larger than three allowed files is refused before its body is parsed (so before
        # the language can be read from it: the message is given in both languages).
        if int(request.META.get("CONTENT_LENGTH") or 0) > attachments.MAX_REQUEST_BYTES:
            both = f"{t('request_too_large', 'fa')} / {t('request_too_large', 'en')}"
            return Response({"code": "too_large", "detail": both}, status=status.HTTP_413_REQUEST_ENTITY_TOO_LARGE)
        # The visitor's language decides the language of every message they get back.
        raw = request.data.get("language") if hasattr(request.data, "get") else None
        language = raw if raw in ("fa", "en") else "fa"
        with translation.override(language):
            serializer = InquiryCreateSerializer(data=request.data, context={"language": language})
            serializer.is_valid(raise_exception=True)
        data = dict(serializer.validated_data)
        done = Response({"received": True}, status=status.HTTP_201_CREATED)
        done["Cache-Control"] = "no-store"
        if data.pop("website", ""):
            return done  # a bot: look successful, store nothing
        uploads = data.pop("attachments", [])
        try:
            create_inquiry(data, uploads, request._request)
        except QuoteError as error:
            return Response(
                {"code": error.code, "detail": error.detail_for(language)}, status=status.HTTP_400_BAD_REQUEST
            )
        return done


# ---- owner -----------------------------------------------------------------------------------------


class InquiryPagination(PageNumberPagination):
    page_size = 20
    max_page_size = 100


def _day(request: Request, name: str) -> date | None:
    raw = request.query_params.get(name)
    if not raw:
        return None
    try:
        return date.fromisoformat(raw)
    except ValueError as error:
        raise serializers.ValidationError({name: "تاریخ باید به شکل YYYY-MM-DD باشد."}) from error


@extend_schema(
    parameters=[
        OpenApiParameter("status", str, enum=[c for c, _ in Inquiry.Status.choices]),
        OpenApiParameter("service", str, description="Service key"),
        OpenApiParameter("from", str, description="YYYY-MM-DD"),
        OpenApiParameter("to", str, description="YYYY-MM-DD"),
        OpenApiParameter("q", str, description="Name, brand, contact or message"),
    ]
)
class InquiryViewSet(
    GuardedDeleteMixin,
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    mixins.DestroyModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    pagination_class = InquiryPagination
    http_method_names = ["get", "patch", "delete", "head", "options"]

    def get_serializer_class(self) -> Any:
        return InquiryListSerializer if self.action == "list" else InquirySerializer

    def _filtered(self) -> QuerySet[Inquiry]:
        params = self.request.query_params
        qs = Inquiry.objects.all()
        if value := params.get("status"):
            qs = qs.filter(status=value)
        if value := params.get("service"):
            qs = qs.filter(service_key=value)
        if start := _day(self.request, "from"):
            qs = qs.filter(created_at__date__gte=start)
        if end := _day(self.request, "to"):
            qs = qs.filter(created_at__date__lte=end)
        if q := (params.get("q") or "").strip():
            qs = qs.filter(
                Q(name__icontains=q)
                | Q(brand__icontains=q)
                | Q(phone__icontains=q)
                | Q(whatsapp__icontains=q)
                | Q(telegram__icontains=q)
                | Q(email__icontains=q)
                | Q(message__icontains=q)
            )
        return qs

    def get_queryset(self) -> QuerySet[Inquiry]:
        qs = self._filtered()
        if self.action == "list":
            return qs.annotate(attachment_count=Count("attachments")).order_by("-created_at", "-id")
        return qs.prefetch_related("attachments", "history")

    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        inquiry = self.get_object()
        if inquiry.seen_at is None:
            inquiry.seen_at = timezone.now()
            inquiry.save(update_fields=["seen_at"])
        return Response(self.get_serializer(inquiry).data)

    def perform_update(self, serializer: Any) -> None:
        before = serializer.instance.status
        inquiry = serializer.save()
        if inquiry.seen_at is None:  # changing it counts as having read it
            inquiry.seen_at = timezone.now()
            inquiry.save(update_fields=["seen_at"])
        fields = sorted(serializer.validated_data)
        if inquiry.status != before:
            user = self.request.user
            InquiryStatusChange.objects.create(
                inquiry=inquiry,
                from_status=before,
                to_status=inquiry.status,
                changed_by=user if user.is_authenticated else None,
            )
        # The note's text is not copied into the audit log, only that it changed.
        record("inquiries.inquiry.update", request=self.request._request, target=inquiry, fields=fields)

    @extend_schema(responses=InquirySummarySerializer, operation_id="inquiries_summary")
    @action(detail=False, methods=["get"])
    def summary(self, request: Request) -> Response:
        """How many enquiries the owner has not opened yet (for the badge on the panel menu)."""
        return Response({"new": Inquiry.objects.filter(seen_at__isnull=True).count()})

    @extend_schema(responses={(200, "text/csv"): bytes}, operation_id="inquiries_export")
    @action(detail=False, methods=["get"])
    def export(self, request: Request) -> HttpResponse:
        """CSV of the filtered enquiries (spreadsheet formulas are neutralised)."""
        rows = list(self._filtered().order_by("-created_at", "-id")[:EXPORT_LIMIT])
        response = HttpResponse(to_csv(rows), content_type="text/csv; charset=utf-8")
        response["Content-Disposition"] = f'attachment; filename="inquiries-{timezone.localdate():%Y%m%d}.csv"'
        response["Cache-Control"] = "no-store"
        record("inquiries.export", request=request._request, count=len(rows))
        return response

    @extend_schema(
        parameters=[OpenApiParameter("attachment_id", int, OpenApiParameter.PATH)],
        responses={302: None},
        description="Redirects to a 60-second signed download via the gateway.",
    )
    @action(detail=True, methods=["get"], url_path=r"attachments/(?P<attachment_id>[^/.]+)")
    def attachment(self, request: Request, pk: str | None = None, attachment_id: str | None = None) -> HttpResponse:
        inquiry = self.get_object()
        raw = attachment_id or ""
        wanted = int(raw) if raw.isdigit() else 0
        file = InquiryAttachment.objects.filter(inquiry=inquiry, pk=wanted).first()
        if file is None:
            return Response({"code": "not_found", "detail": "پیوست پیدا نشد."}, status=status.HTTP_404_NOT_FOUND)
        # Always a download, never rendered in the site's origin, whatever the file claims to be.
        disposition = f"attachment; filename*=UTF-8''{quote(file.original_name)}"
        signed = urlsplit(
            private_storage().url(file.key, parameters={"ResponseContentDisposition": disposition}, expire=DOWNLOAD_TTL)
        )
        response = HttpResponse(status=status.HTTP_302_FOUND)
        response["Location"] = f"{SIGNED_PREFIX}{signed.path}?{signed.query}"
        response["Cache-Control"] = "no-store"
        response["Referrer-Policy"] = "no-referrer"
        record("inquiries.attachment.download", request=request._request, target=inquiry, attachment=file.pk)
        return response
