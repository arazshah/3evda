from datetime import date, time, timedelta
from typing import Any

from django.db import transaction
from django.db.models import Q, QuerySet
from django.http import HttpRequest
from django.utils import timezone, translation
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, mixins, serializers, status, viewsets
from rest_framework.decorators import action
from rest_framework.pagination import PageNumberPagination
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.service import record
from apps.core.viewsets import AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin

from . import service
from .links import find_by_token, public_url
from .messages import t
from .models import Booking, BookingSettings, ClosedPeriod, SessionType, WorkingHours
from .serializers import (
    AdminBookingCreateSerializer,
    AvailabilitySerializer,
    BookingCreateSerializer,
    BookingListSerializer,
    BookingReceivedSerializer,
    BookingSerializer,
    BookingSettingsSerializer,
    BookingSummarySerializer,
    ClosedPeriodSerializer,
    PublicBookingSerializer,
    PublicOptionsSerializer,
    ReasonSerializer,
    RescheduleSerializer,
    SessionTypeSerializer,
    WeeklyHoursSerializer,
    WorkingHoursSerializer,
    hhmm,
    public_data,
)
from .slots import at

NO_STORE = "no-store"


def _error(error: service.BookingError, language: str = "fa") -> Response:
    return Response({"code": error.code, "detail": error.detail_for(language)}, status=error.status)


def _no_store(response: Response) -> Response:
    response["Cache-Control"] = NO_STORE
    return response


# ---- owner: settings -------------------------------------------------------------------------------


class SessionTypeViewSet(AuditedPositionedMixin, ReorderMixin, GuardedDeleteMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    queryset = SessionType.objects.all()
    serializer_class = SessionTypeSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]


class ClosedPeriodViewSet(viewsets.ModelViewSet):  # type: ignore[type-arg]
    queryset = ClosedPeriod.objects.all()
    serializer_class = ClosedPeriodSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def perform_create(self, serializer: Any) -> None:
        record("booking.closedperiod.create", request=self.request._request, target=serializer.save())

    def perform_update(self, serializer: Any) -> None:
        record("booking.closedperiod.update", request=self.request._request, target=serializer.save())

    def perform_destroy(self, instance: ClosedPeriod) -> None:
        pk = instance.pk
        instance.delete()
        record("booking.closedperiod.delete", request=self.request._request, object_id=str(pk))


class BookingSettingsView(generics.RetrieveUpdateAPIView):  # type: ignore[type-arg]
    serializer_class = BookingSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self) -> BookingSettings:
        return BookingSettings.load()

    def perform_update(self, serializer: Any) -> None:
        serializer.save()
        record("booking.settings.update", request=self.request._request, fields=sorted(serializer.validated_data))


class WeeklyHoursView(APIView):
    """The whole week at once: PUT replaces every interval."""

    @extend_schema(responses=WeeklyHoursSerializer, operation_id="booking_hours_retrieve")
    def get(self, request: Request) -> Response:
        return Response({"hours": WorkingHoursSerializer(WorkingHours.objects.all(), many=True).data})

    @extend_schema(request=WeeklyHoursSerializer, responses=WeeklyHoursSerializer, operation_id="booking_hours_update")
    def put(self, request: Request) -> Response:
        body = WeeklyHoursSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        with transaction.atomic():
            # Taking the booking lock keeps a slot calculation from reading a half-replaced week.
            BookingSettings.objects.select_for_update().get_or_create(pk=1)
            WorkingHours.objects.all().delete()
            WorkingHours.objects.bulk_create(WorkingHours(**row) for row in body.validated_data["hours"])
        record("booking.hours.update", request=request._request, count=len(body.validated_data["hours"]))
        return Response({"hours": WorkingHoursSerializer(WorkingHours.objects.all(), many=True).data})


# ---- owner: bookings -------------------------------------------------------------------------------


class BookingPagination(PageNumberPagination):
    page_size = 20
    page_size_query_param = "page_size"
    max_page_size = 500


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
        OpenApiParameter("status", str, enum=[c for c, _ in Booking.Status.choices]),
        OpenApiParameter("from", str, description="YYYY-MM-DD (Tehran)"),
        OpenApiParameter("to", str, description="YYYY-MM-DD (Tehran)"),
        OpenApiParameter("q", str),
    ]
)
class BookingViewSet(
    mixins.ListModelMixin,
    mixins.RetrieveModelMixin,
    mixins.UpdateModelMixin,
    viewsets.GenericViewSet,  # type: ignore[type-arg]
):
    pagination_class = BookingPagination
    http_method_names = ["get", "post", "patch", "head", "options"]

    def get_serializer_class(self) -> Any:
        return BookingListSerializer if self.action == "list" else BookingSerializer

    def get_queryset(self) -> QuerySet[Booking]:
        qs = Booking.objects.all()
        if self.action != "list":
            return qs
        params = self.request.query_params
        if value := params.get("status"):
            qs = qs.filter(status=value)
        if start := _day(self.request, "from"):
            qs = qs.filter(start_at__gte=at(start, time(0)))
        if end := _day(self.request, "to"):
            qs = qs.filter(start_at__lt=at(end + timedelta(days=1), time(0)))
        if q := (params.get("q") or "").strip():
            qs = qs.filter(
                Q(name__icontains=q) | Q(brand__icontains=q) | Q(phone__icontains=q) | Q(whatsapp__icontains=q)
                | Q(telegram__icontains=q) | Q(email__icontains=q)
            )  # fmt: skip
        return qs

    def retrieve(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        booking = self.get_object()
        if booking.seen_at is None:
            booking.seen_at = timezone.now()
            booking.save(update_fields=["seen_at"])
        return Response(self.get_serializer(booking).data)

    def perform_update(self, serializer: Any) -> None:
        booking = serializer.save()
        record(
            "booking.booking.update",
            request=self.request._request,
            target=booking,
            fields=sorted(serializer.validated_data),
        )

    @extend_schema(request=AdminBookingCreateSerializer, responses={201: BookingSerializer})
    def create(self, request: Request) -> Response:
        """A booking made by the owner (after a phone call, say): outside the hours is fine, overlap never."""
        body = AdminBookingCreateSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        try:
            booking = service.create_booking(dict(body.validated_data), request._request, admin=True)
        except service.BookingError as error:
            return _error(error)
        return Response(BookingSerializer(booking).data, status=status.HTTP_201_CREATED)

    def _act(self, fn: Any, *args: Any, **kwargs: Any) -> Response:
        try:
            booking = fn(*args, **kwargs)
        except service.BookingError as error:
            return _error(error)
        return Response(BookingSerializer(Booking.objects.get(pk=booking.pk)).data)

    @extend_schema(request=None, responses=BookingSerializer)
    @action(detail=True, methods=["post"])
    def confirm(self, request: Request, pk: str | None = None) -> Response:
        return self._act(service.confirm, self.get_object().pk, request._request)

    @extend_schema(request=None, responses=BookingSerializer)
    @action(detail=True, methods=["post"])
    def complete(self, request: Request, pk: str | None = None) -> Response:
        return self._act(service.complete, self.get_object().pk, request._request)

    @extend_schema(request=ReasonSerializer, responses=BookingSerializer)
    @action(detail=True, methods=["post"])
    def cancel(self, request: Request, pk: str | None = None) -> Response:
        body = ReasonSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return self._act(service.cancel, self.get_object().pk, request._request, body.validated_data["reason"])

    @extend_schema(request=RescheduleSerializer, responses=BookingSerializer)
    @action(detail=True, methods=["post"])
    def reschedule(self, request: Request, pk: str | None = None) -> Response:
        body = RescheduleSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        return self._act(
            service.reschedule,
            self.get_object().pk,
            body.validated_data["date"],
            body.validated_data["time"],
            request._request,
        )

    @extend_schema(responses=BookingSummarySerializer, operation_id="bookings_summary")
    @action(detail=False, methods=["get"])
    def summary(self, request: Request) -> Response:
        """Upcoming bookings still waiting for an answer (for the badge on the panel menu)."""
        return Response({"pending": service.pending_count()})


# ---- visitors --------------------------------------------------------------------------------------


class _Public(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]


class PublicOptionsView(_Public):
    @extend_schema(responses=PublicOptionsSerializer, operation_id="public_booking_options", auth=[])
    def get(self, request: Request) -> Response:
        settings = BookingSettings.load()
        data = {
            "session_types": SessionType.objects.filter(is_active=True),
            "horizon_days": settings.horizon_days,
            "min_notice_hours": settings.min_notice_hours,
        }
        response = Response(PublicOptionsSerializer(data).data)
        response["Cache-Control"] = "public, max-age=30"
        return response


class PublicAvailabilityView(_Public):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "estimate"

    @extend_schema(
        parameters=[
            OpenApiParameter("type", str, required=True),
            OpenApiParameter("from", str, required=True, description="YYYY-MM-DD"),
            OpenApiParameter("to", str, required=True, description="YYYY-MM-DD"),
        ],
        responses=AvailabilitySerializer,
        operation_id="public_booking_availability",
        auth=[],
    )
    def get(self, request: Request) -> Response:
        stype = SessionType.objects.filter(key=request.query_params.get("type", ""), is_active=True).first()
        first, last = _day(request, "from"), _day(request, "to")
        if stype is None or first is None or last is None:
            raise serializers.ValidationError({"type": "type, from and to are required."})
        try:
            found = service.availability(stype, first, last)
        except service.BookingError as error:
            return _error(error)
        days = [{"date": day, "times": [hhmm(x) for x in times]} for day, times in found.items()]
        return _no_store(Response(AvailabilitySerializer({"days": days}).data))


class PublicBookingCreateView(_Public):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "booking"

    @extend_schema(
        request=BookingCreateSerializer,
        responses={201: BookingReceivedSerializer},
        operation_id="public_bookings_create",
        auth=[],
    )
    def post(self, request: Request) -> Response:
        raw = request.data.get("language") if hasattr(request.data, "get") else None
        language = raw if raw in ("fa", "en") else "fa"
        with translation.override(language):
            body = BookingCreateSerializer(data=request.data, context={"language": language})
            body.is_valid(raise_exception=True)
        data = dict(body.validated_data)
        if data.pop("website", ""):
            return _no_store(Response({"status": "pending"}, status=status.HTTP_201_CREATED))  # a bot: store nothing
        data.pop("type")
        try:
            booking = service.create_booking(data, request._request)
        except service.BookingError as error:
            return _error(error, language)
        return _no_store(
            Response({**public_data(booking), "link": public_url(booking)}, status=status.HTTP_201_CREATED)
        )


class _PublicBooking(_Public):
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "booking_read"

    @staticmethod
    def _missing() -> Response:
        return _no_store(Response({"code": "not_found", "detail": t("not_cancellable", "fa")}, status=404))


class PublicBookingView(_PublicBooking):
    @extend_schema(responses=PublicBookingSerializer, operation_id="public_bookings_retrieve", auth=[])
    def get(self, request: Request, token: str) -> Response:
        booking = find_by_token(token)
        if booking is None:
            return self._missing()
        return _no_store(Response(PublicBookingSerializer(public_data(booking)).data))


class PublicBookingCancelView(_PublicBooking):
    @extend_schema(request=None, responses=PublicBookingSerializer, operation_id="public_bookings_cancel", auth=[])
    def post(self, request: Request, token: str) -> Response:
        booking = find_by_token(token)
        if booking is None:
            return self._missing()
        try:
            done = service.customer_cancel(booking, _plain(request))
        except service.BookingError as error:
            return _error(error, booking.language)
        return _no_store(Response(PublicBookingSerializer(public_data(Booking.objects.get(pk=done.pk))).data))


def _plain(request: Request) -> HttpRequest:
    return request._request
