"""Session authentication for the panel: password, then TOTP (or a recovery code)."""

from typing import Any, cast

import segno
from django.contrib.auth import authenticate, login, logout, password_validation, update_session_auth_hash
from django.core.exceptions import ValidationError
from django.db import transaction
from django.http import HttpRequest, JsonResponse
from django.utils.decorators import method_decorator
from django.views.decorators.csrf import csrf_protect, ensure_csrf_cookie
from django_otp import devices_for_user
from django_otp import login as otp_login
from django_otp.plugins.otp_static.models import StaticDevice, StaticToken
from django_otp.plugins.otp_totp.models import TOTPDevice
from drf_spectacular.utils import extend_schema, inline_serializer
from rest_framework import serializers, status
from rest_framework.permissions import AllowAny
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.throttling import ScopedRateThrottle
from rest_framework.views import APIView

from apps.audit.service import record

from .models import User
from .permissions import HasPasswordSession, IsVerifiedOwner

RECOVERY_CODE_COUNT = 10


def lockout_response(request: HttpRequest, credentials: Any = None, *args: Any, **kwargs: Any) -> JsonResponse:
    return JsonResponse(
        {"code": "locked_out", "detail": "تلاش‌های ناموفق زیاد بود. ۱۵ دقیقه دیگر دوباره امتحان کنید."}, status=429
    )


def _error(code: str, detail: str, http_status: int = status.HTTP_400_BAD_REQUEST) -> Response:
    return Response({"code": code, "detail": detail}, status=http_status)


def _has_confirmed_totp(user: Any) -> bool:
    return bool(TOTPDevice.objects.filter(user=user, confirmed=True).exists())


def auth_state(request: HttpRequest) -> str:
    user = request.user
    if not user.is_authenticated:
        return "anonymous"
    # OTPMiddleware adds is_verified() to request.user; a user just returned by authenticate() lacks it.
    is_verified = getattr(user, "is_verified", None)
    if callable(is_verified) and is_verified():
        return "verified"
    return "otp_required" if _has_confirmed_totp(user) else "enrollment_required"


def _issue_recovery_codes(user: Any) -> list[str]:
    StaticDevice.objects.filter(user=user).delete()
    device = StaticDevice.objects.create(user=user, name="recovery", confirmed=True)
    codes = [StaticToken.random_token() for _ in range(RECOVERY_CODE_COUNT)]
    StaticToken.objects.bulk_create([StaticToken(device=device, token=code) for code in codes])
    return codes


class StateSerializer(serializers.Serializer):  # type: ignore[type-arg]
    state = serializers.ChoiceField(choices=["anonymous", "otp_required", "enrollment_required", "verified"])
    user = inline_serializer(
        "AuthUser",
        {"username": serializers.CharField(), "display_name": serializers.CharField()},
        allow_null=True,
    )


class ErrorSerializer(serializers.Serializer):  # type: ignore[type-arg]
    code = serializers.CharField()
    detail = serializers.CharField()


class CredentialsSerializer(serializers.Serializer):  # type: ignore[type-arg]
    username = serializers.CharField(max_length=150)
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class CodeSerializer(serializers.Serializer):  # type: ignore[type-arg]
    code = serializers.CharField(max_length=16)


class PasswordSerializer(serializers.Serializer):  # type: ignore[type-arg]
    password = serializers.CharField(max_length=256, trim_whitespace=False)


class PasswordChangeSerializer(serializers.Serializer):  # type: ignore[type-arg]
    current_password = serializers.CharField(max_length=256, trim_whitespace=False)
    new_password = serializers.CharField(max_length=256, trim_whitespace=False)


class RecoveryCodesSerializer(serializers.Serializer):  # type: ignore[type-arg]
    recovery_codes = serializers.ListField(child=serializers.CharField())


class TotpSetupSerializer(serializers.Serializer):  # type: ignore[type-arg]
    otpauth_uri = serializers.CharField()
    secret = serializers.CharField()
    qr_data_uri = serializers.CharField()


def _state_body(request: HttpRequest) -> dict[str, Any]:
    state = auth_state(request)
    user = request.user
    payload = (
        {"username": user.get_username(), "display_name": getattr(user, "display_name", "")}
        if state != "anonymous"
        else None
    )
    return {"state": state, "user": payload}


class CsrfView(APIView):
    permission_classes = [AllowAny]
    authentication_classes: list[type] = []

    @extend_schema(responses={204: None}, summary="Set the CSRF cookie")
    @method_decorator(ensure_csrf_cookie)
    def get(self, request: Request) -> Response:
        return Response(status=status.HTTP_204_NO_CONTENT)


class MeView(APIView):
    permission_classes = [AllowAny]

    @extend_schema(responses=StateSerializer)
    def get(self, request: Request) -> Response:
        return Response(_state_body(request))


@method_decorator(csrf_protect, name="dispatch")
class LoginView(APIView):
    permission_classes = [AllowAny]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "login"

    @extend_schema(request=CredentialsSerializer, responses={200: StateSerializer, 400: ErrorSerializer})
    def post(self, request: Request) -> Response:
        data = CredentialsSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = authenticate(request._request, **data.validated_data)
        if user is None:
            return _error("invalid_credentials", "نام کاربری یا رمز عبور درست نیست.")
        login(request._request, user)
        request.user = user  # DRF cached the anonymous user before login
        return Response(_state_body(request))


class VerifyView(APIView):
    permission_classes = [HasPasswordSession]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    @extend_schema(request=CodeSerializer, responses={200: StateSerializer, 400: ErrorSerializer})
    def post(self, request: Request) -> Response:
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        token = data.validated_data["code"].replace(" ", "")
        for device in devices_for_user(request.user, confirmed=True):
            allowed, _ = device.verify_is_allowed()
            if allowed and device.verify_token(token):
                otp_login(request._request, device)
                if isinstance(device, StaticDevice):
                    record("auth.recovery_code_used", request=request._request, remaining=device.token_set.count())
                record("auth.otp_verified", request=request._request)
                return Response(_state_body(request))
        record("auth.otp_failed", request=request._request)
        return _error("invalid_code", "کد واردشده درست نیست.")


class TotpSetupView(APIView):
    permission_classes = [HasPasswordSession]

    @extend_schema(responses={200: TotpSetupSerializer, 409: ErrorSerializer})
    def get(self, request: Request) -> Response:
        user = request.user
        if _has_confirmed_totp(user):
            return _error("already_enrolled", "ورود دومرحله‌ای قبلاً فعال شده است.", status.HTTP_409_CONFLICT)
        device = TOTPDevice.objects.filter(user=user, confirmed=False).first()
        if device is None:
            device = TOTPDevice.objects.create(user=user, name="authenticator", confirmed=False)
        uri = device.config_url
        secret = uri.split("secret=")[1].split("&")[0]
        qr = segno.make(uri, error="m").svg_data_uri(scale=5, dark="#0F0D0B", light="#F2EADF")
        return Response({"otpauth_uri": uri, "secret": secret, "qr_data_uri": qr})


class TotpConfirmView(APIView):
    permission_classes = [HasPasswordSession]
    throttle_classes = [ScopedRateThrottle]
    throttle_scope = "otp"

    @extend_schema(request=CodeSerializer, responses={200: RecoveryCodesSerializer, 400: ErrorSerializer})
    def post(self, request: Request) -> Response:
        data = CodeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if _has_confirmed_totp(request.user):
            return _error("already_enrolled", "ورود دومرحله‌ای قبلاً فعال شده است.", status.HTTP_409_CONFLICT)
        device = TOTPDevice.objects.filter(user=request.user, confirmed=False).first()
        if device is None or not device.verify_token(data.validated_data["code"].replace(" ", "")):
            return _error("invalid_code", "کد واردشده درست نیست.")
        with transaction.atomic():
            device.confirmed = True
            device.save(update_fields=["confirmed"])
            codes = _issue_recovery_codes(request.user)
            record("auth.totp_enrolled", request=request._request)
        otp_login(request._request, device)
        return Response({"recovery_codes": codes})


class RecoveryCodesView(APIView):
    permission_classes = [IsVerifiedOwner]

    @extend_schema(request=PasswordSerializer, responses={200: RecoveryCodesSerializer, 400: ErrorSerializer})
    def post(self, request: Request) -> Response:
        data = PasswordSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        if not request.user.check_password(data.validated_data["password"]):
            return _error("invalid_credentials", "رمز عبور درست نیست.")
        with transaction.atomic():
            codes = _issue_recovery_codes(request.user)
            record("auth.recovery_codes_regenerated", request=request._request)
        return Response({"recovery_codes": codes})


class PasswordChangeView(APIView):
    permission_classes = [IsVerifiedOwner]

    @extend_schema(request=PasswordChangeSerializer, responses={204: None, 400: ErrorSerializer})
    def post(self, request: Request) -> Response:
        data = PasswordChangeSerializer(data=request.data)
        data.is_valid(raise_exception=True)
        user = cast(User, request.user)
        if not user.check_password(data.validated_data["current_password"]):
            return _error("invalid_credentials", "رمز فعلی درست نیست.")
        try:
            password_validation.validate_password(data.validated_data["new_password"], user)
        except ValidationError as exc:
            return _error("invalid_password", " ".join(exc.messages))
        user.set_password(data.validated_data["new_password"])
        user.save(update_fields=["password"])
        # Keeps this session (and its verified second factor); every other session is invalidated
        # because its stored password hash no longer matches.
        update_session_auth_hash(request._request, user)
        record("auth.password_changed", request=request._request)
        return Response(status=status.HTTP_200_OK)


class LogoutView(APIView):
    permission_classes = [HasPasswordSession]

    @extend_schema(request=None, responses={204: None})
    def post(self, request: Request) -> Response:
        logout(request._request)
        return Response(status=status.HTTP_204_NO_CONTENT)
