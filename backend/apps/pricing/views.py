from typing import Any

from django.db.models import Count, Prefetch, QuerySet
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import generics, status, viewsets
from rest_framework.decorators import action
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.service import record
from apps.core.viewsets import AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin

from . import quote
from .models import Package, PackageGroup, QuoteRule, QuoteSettings
from .serializers import (
    PackageGroupSerializer,
    PackageSerializer,
    PublicGroupSerializer,
    PublicPackagesSerializer,
    QuoteEstimateSerializer,
    QuoteInputSerializer,
    QuoteOptionsSerializer,
    QuotePreviewSerializer,
    QuoteRuleSerializer,
    QuoteSettingsSerializer,
)

PUBLIC_CACHE = "public, max-age=30"


class PublicPackagesView(APIView):
    """Published groups with their published packages; groups without packages are left out."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=PublicPackagesSerializer, auth=[])
    def get(self, request: Request) -> Response:
        packages = Package.objects.filter(is_published=True).prefetch_related("features")
        groups = [
            g
            for g in PackageGroup.objects.filter(is_published=True).prefetch_related(
                Prefetch("packages", queryset=packages)
            )
            if g.packages.all()
        ]
        response = Response({"groups": PublicGroupSerializer(groups, many=True).data})
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class PackageGroupViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = PackageGroupSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[PackageGroup]:
        return PackageGroup.objects.annotate(package_count=Count("packages")).order_by("position", "id")


@extend_schema(parameters=[OpenApiParameter("group", int)])
class PackageViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = PackageSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[Package]:
        qs = Package.objects.prefetch_related("features")
        if group := self.request.query_params.get("group"):
            qs = qs.filter(group_id=int(group))
        return qs.order_by("position", "id")


# ---- price calculator ------------------------------------------------------------------------------


def _rules() -> list[quote.Rule]:
    return [
        quote.Rule(r.key, r.kind, r.amount, r.factor, r.min_quantity) for r in QuoteRule.objects.filter(is_active=True)
    ]


def _limits() -> quote.Limits:
    s = QuoteSettings.load()
    return quote.Limits(s.range_percent, s.rounding_step, s.min_quantity, s.max_quantity)


def run_estimate(data: dict[str, Any]) -> quote.Estimate:
    """The estimate for validated input; raises `quote.QuoteError` for choices that do not exist."""
    return quote.estimate(
        _rules(),
        _limits(),
        service=data["service"],
        quantity=data["quantity"],
        addons=data["addons"],
        multipliers=data["multipliers"],
    )


def _quote_error(error: quote.QuoteError) -> Response:
    return Response({"code": error.code, "detail": error.detail}, status=status.HTTP_400_BAD_REQUEST)


class PublicQuoteOptionsView(APIView):
    """What the calculator offers: labels and quantity limits only, no prices or factors."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]

    @extend_schema(responses=QuoteOptionsSerializer, operation_id="public_quote_options_retrieve", auth=[])
    def get(self, request: Request) -> Response:
        active = QuoteRule.objects.filter(is_active=True)
        limits = _limits()
        response = Response(
            {
                "services": active.filter(kind=QuoteRule.Kind.SERVICE).values("key", "label_fa", "label_en"),
                "addons": active.filter(kind__in=[QuoteRule.Kind.ADDON_FIXED, QuoteRule.Kind.ADDON_PER_ITEM]).values(
                    "key", "label_fa", "label_en"
                ),
                "multipliers": active.filter(kind=QuoteRule.Kind.MULTIPLIER).values("key", "label_fa", "label_en"),
                "min_quantity": limits.min_quantity,
                "max_quantity": limits.max_quantity,
            }
        )
        response["Cache-Control"] = PUBLIC_CACHE
        return response


class PublicQuoteEstimateView(APIView):
    """Choices in, an approximate price range out. Nothing is stored."""

    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "estimate"

    @extend_schema(
        request=QuoteInputSerializer,
        responses=QuoteEstimateSerializer,
        operation_id="public_quote_estimate_create",
        auth=[],
    )
    def post(self, request: Request) -> Response:
        serializer = QuoteInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_estimate(serializer.validated_data)
        except quote.QuoteError as error:
            return _quote_error(error)
        response = Response({"low": result.low, "high": result.high, "currency": "toman", "approximate": True})
        response["Cache-Control"] = "no-store"
        return response


class QuoteRuleViewSet(AuditedPositionedMixin, GuardedDeleteMixin, ReorderMixin, viewsets.ModelViewSet):  # type: ignore[type-arg]
    serializer_class = QuoteRuleSerializer
    http_method_names = ["get", "post", "patch", "delete", "head", "options"]

    def get_queryset(self) -> QuerySet[QuoteRule]:
        return QuoteRule.objects.order_by("position", "id")

    @extend_schema(request=QuoteInputSerializer, responses=QuotePreviewSerializer, operation_id="pricing_rules_preview")
    @action(detail=False, methods=["post"])
    def preview(self, request: Request) -> Response:
        """Try the saved rules with some choices, and see how the number is built."""
        serializer = QuoteInputSerializer(data=request.data)
        serializer.is_valid(raise_exception=True)
        try:
            result = run_estimate(serializer.validated_data)
        except quote.QuoteError as error:
            return _quote_error(error)
        return Response(
            {
                "low": result.low,
                "high": result.high,
                "currency": "toman",
                "approximate": True,
                "total": result.total,
                "base": result.base,
                "tier_factor": str(result.tier_factor),
                "addons": [[key, str(amount)] for key, amount in result.addons],
                "multipliers": [[key, str(factor)] for key, factor in result.multipliers],
            }
        )


class QuoteSettingsView(generics.RetrieveUpdateAPIView):  # type: ignore[type-arg]
    serializer_class = QuoteSettingsSerializer
    http_method_names = ["get", "patch", "head", "options"]

    def get_object(self) -> QuoteSettings:
        return QuoteSettings.load()

    def perform_update(self, serializer: Any) -> None:
        serializer.save()
        record("pricing.quotesettings.update", request=self.request._request, fields=sorted(serializer.validated_data))
