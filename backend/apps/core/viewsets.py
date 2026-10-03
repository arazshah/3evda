"""Behaviour shared by the owner's CRUD endpoints."""

from typing import Any

from django.db import transaction
from django.db.models import Model
from django.db.models.deletion import ProtectedError
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.decorators import action
from rest_framework.request import Request
from rest_framework.response import Response

from apps.audit.service import record

IN_USE = {"code": "in_use", "detail": "این مورد هنوز استفاده می‌شود؛ ابتدا موارد وابسته را حذف یا جابه‌جا کنید."}


class AuditedPositionedMixin:
    """New rows go to the end of the list; create and update are written to the audit log."""

    def perform_create(self, serializer: Any) -> None:
        model = serializer.Meta.model
        last = model._default_manager.order_by("-position").first()
        obj = serializer.save(position=(last.position + 1) if last else 0)
        record(f"{model._meta.label_lower}.create", request=self.request._request, target=obj)  # type: ignore[attr-defined]

    def perform_update(self, serializer: Any) -> None:
        obj = serializer.save()
        record(
            f"{serializer.Meta.model._meta.label_lower}.update",
            request=self.request._request,  # type: ignore[attr-defined]
            target=obj,
            fields=sorted(serializer.validated_data),
        )


class GuardedDeleteMixin:
    """DELETE answers 409 (not 500) when other rows still reference the object."""

    def destroy(self, request: Request, *args: Any, **kwargs: Any) -> Response:
        instance = self.get_object()  # type: ignore[attr-defined]
        label = instance._meta.label_lower
        pk = instance.pk
        try:
            self.perform_destroy(instance)  # type: ignore[attr-defined]
        except ProtectedError:
            return Response(IN_USE, status=status.HTTP_409_CONFLICT)
        record(f"{label}.delete", request=request._request, object_id=str(pk))
        return Response(status=status.HTTP_204_NO_CONTENT)


class ReorderMixin:
    """`POST reorder/ {"ids": [...]}` sets `position` for the whole table in the given order."""

    @extend_schema(
        request=inline_serializer("ReorderIds", {"ids": serializers.ListField(child=serializers.IntegerField())}),
        responses={204: None},
    )
    @action(detail=False, methods=["post"])
    def reorder(self, request: Request) -> Response:
        model: type[Model] = self.get_queryset().model  # type: ignore[attr-defined]
        ids = request.data.get("ids") if isinstance(request.data, dict) else None
        existing = set(model._default_manager.values_list("pk", flat=True))
        if not isinstance(ids, list) or len(ids) != len(set(ids)) or set(ids) != existing:
            return Response(
                {"code": "bad_order", "detail": "فهرست باید دقیقاً همه‌ی موارد را یک‌بار شامل شود."},
                status=status.HTTP_400_BAD_REQUEST,
            )
        with transaction.atomic():
            for position, pk in enumerate(ids):
                model._default_manager.filter(pk=pk).update(position=position)
        record(f"{model._meta.label_lower}.reorder", request=request._request, count=len(ids))
        return Response(status=status.HTTP_204_NO_CONTENT)
