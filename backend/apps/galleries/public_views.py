"""The client's side of a gallery. Everything is no-store; a wrong or unknown link looks the same as a missing one."""

from __future__ import annotations

from typing import Any

from django.contrib.auth.hashers import check_password
from drf_spectacular.utils import OpenApiParameter, extend_schema
from rest_framework import serializers
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.core.privacy import ip_digest
from apps.core.signed import signed_path

from . import access, service
from .links import find_by_token
from .models import Gallery, GalleryPhoto, Selection
from .public_serializers import (
    PublicGallerySerializer,
    PublicPhotosSerializer,
    SelectionRequestSerializer,
    SelectionSerializer,
    SubmitResponseSerializer,
    UnlockRequestSerializer,
    UnlockResponseSerializer,
)

NO_STORE = "no-store"
PREVIEW_TTL = 3600  # the page asks for a fresh list every 20 minutes
TOKEN_PARAMETER = OpenApiParameter(access.HEADER, str, OpenApiParameter.HEADER, required=True)


def _reply(data: Any, status: int = 200) -> Response:
    response = Response(data, status=status)
    response["Cache-Control"] = NO_STORE
    return response


def _problem(code: str, detail: str, status: int) -> Response:
    return _reply({"code": code, "detail": detail}, status)


def _missing() -> Response:
    return _problem("not_found", "این گالری پیدا نشد.", 404)


class _Public(APIView):
    authentication_classes: list[Any] = []
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "gallery_read"

    def visible(self, token: str) -> Gallery | None:
        gallery = find_by_token(token)
        return gallery if gallery is not None and service.client_can_see(gallery) else None


class _Unlocked(_Public):
    """A view that needs the access token (given by `unlock`) as well as the link."""

    def gate(self, request: Request, token: str) -> Gallery | Response:
        gallery = self.visible(token)
        if gallery is None:
            return _missing()
        if service.effective_status(gallery) == service.EXPIRED:
            return _problem("expired", "مهلت این گالری تمام شده است.", 410)
        if not access.check_access_token(gallery, request.headers.get(access.HEADER, "")):
            return _problem("locked", "ابتدا گالری را باز کنید.", 401)
        return gallery


def _chosen(gallery: Gallery) -> int:
    return Selection.objects.filter(photo__gallery=gallery, selected=True).count()


class PublicGalleryView(_Public):
    @extend_schema(responses=PublicGallerySerializer, operation_id="public_galleries_retrieve", auth=[])
    def get(self, request: Request, token: str) -> Response:
        gallery = self.visible(token)
        if gallery is None:
            return _missing()
        data = {
            "title": gallery.title,
            "client_name": gallery.client_name,
            "language": gallery.language,
            "status": service.effective_status(gallery),
            "has_password": gallery.has_password,
            "selection_limit": gallery.selection_limit,
            "download_level": gallery.download_level,
            "submitted": gallery.status == Gallery.Status.SUBMITTED,
        }
        return _reply(PublicGallerySerializer(data).data)


class PublicUnlockView(_Public):
    throttle_scope = "gallery_unlock"

    @extend_schema(
        request=UnlockRequestSerializer,
        responses={200: UnlockResponseSerializer},
        operation_id="public_galleries_unlock",
        auth=[],
    )
    def post(self, request: Request, token: str) -> Response:
        body = UnlockRequestSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        raw = body.validated_data.get("password", "")
        # A wrong password, an unknown link and a draft all answer the same way.
        refused = _problem("locked", "رمز درست نیست.", 403)
        gallery = self.visible(token)
        if gallery is None:
            return refused
        if service.effective_status(gallery) == service.EXPIRED:
            return _problem("expired", "مهلت این گالری تمام شده است.", 410)
        visitor = ip_digest(request._request, "gallery")
        if gallery.has_password:
            if access.guessing_blocked(gallery, visitor):
                return _problem("too_many", "تلاش‌های زیاد؛ کمی بعد دوباره امتحان کنید.", 429)
            if not raw or not check_password(raw, gallery.password_hash):
                access.note_wrong_password(gallery, visitor)
                return refused
        return _reply({"token": access.make_access_token(gallery), "expires_in": access.TOKEN_TTL})


class PublicPhotosView(_Unlocked):
    @extend_schema(
        parameters=[TOKEN_PARAMETER],
        responses=PublicPhotosSerializer,
        operation_id="public_galleries_photos",
        auth=[],
    )
    def get(self, request: Request, token: str) -> Response:
        gallery = self.gate(request, token)
        if isinstance(gallery, Response):
            return gallery
        picks = {s.photo_id: s for s in Selection.objects.filter(photo__gallery=gallery)}
        photos = []
        for photo in gallery.photos.filter(status=GalleryPhoto.Status.READY):
            pick = picks.get(photo.pk)
            photos.append(
                {
                    "id": photo.pk,
                    "name": photo.original_filename,
                    "width": photo.width,
                    "height": photo.height,
                    "thumb_url": signed_path(photo.thumb_key, expire=PREVIEW_TTL),
                    "preview_url": signed_path(photo.preview_key, expire=PREVIEW_TTL),
                    "selected": bool(pick and pick.selected),
                    "comment": pick.comment if pick else "",
                    "retouch": bool(pick and pick.retouch),
                }
            )
        data = {
            "selection_limit": gallery.selection_limit,
            "selected_count": sum(1 for p in photos if p["selected"]),
            "submitted": gallery.status == Gallery.Status.SUBMITTED,
            "photos": photos,
        }
        return _reply(PublicPhotosSerializer(data).data)


class PublicSelectionView(_Unlocked):
    throttle_scope = "gallery_write"

    @extend_schema(
        parameters=[TOKEN_PARAMETER],
        request=SelectionRequestSerializer,
        responses=SelectionSerializer,
        operation_id="public_galleries_selection",
        auth=[],
    )
    def put(self, request: Request, token: str, photo_id: int) -> Response:
        gallery = self.gate(request, token)
        if isinstance(gallery, Response):
            return gallery
        body = SelectionRequestSerializer(data=request.data)
        try:
            body.is_valid(raise_exception=True)
        except serializers.ValidationError as error:
            return _problem("invalid", str(error.detail), 400)
        data = body.validated_data
        try:
            row = service.set_selection(
                gallery,
                photo_id,
                selected=data.get("selected"),
                comment=data.get("comment"),
                retouch=data.get("retouch"),
            )
        except service.GalleryError as error:
            return _problem(error.code, error.detail, error.status)
        payload = {
            "selected": row.selected,
            "comment": row.comment,
            "retouch": row.retouch,
            "selected_count": _chosen(gallery),
        }
        return _reply(SelectionSerializer(payload).data)


class PublicSubmitView(_Unlocked):
    throttle_scope = "gallery_write"

    @extend_schema(
        parameters=[TOKEN_PARAMETER],
        request=None,
        responses=SubmitResponseSerializer,
        operation_id="public_galleries_submit",
        auth=[],
    )
    def post(self, request: Request, token: str) -> Response:
        gallery = self.gate(request, token)
        if isinstance(gallery, Response):
            return gallery
        try:
            done = service.submit(gallery, ip_digest(request._request, "gallery"))
        except service.GalleryError as error:
            return _problem(error.code, error.detail, error.status)
        return _reply({"submitted": True, "selected_count": _chosen(done)})
