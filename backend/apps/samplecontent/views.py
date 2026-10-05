from typing import Any

from drf_spectacular.utils import extend_schema
from rest_framework import status
from rest_framework.request import Request
from rest_framework.response import Response
from rest_framework.views import APIView

from . import service
from .models import SampleState
from .serializers import ConfirmSerializer, SampleStateSerializer
from .tasks import load_sample_content, unload_sample_content


def _state_body() -> dict[str, Any]:
    state = service.current_state()
    return {
        "status": state.status,
        "message": state.message,
        "counts": service.counts(),
        "result": state.result,
        "updated_at": state.updated_at,
    }


class StateView(APIView):
    @extend_schema(responses=SampleStateSerializer, operation_id="sample_content_state")
    def get(self, request: Request) -> Response:
        return Response(_state_body())


def _refused(error: service.SampleError) -> Response:
    return Response({"code": error.code, "detail": error.message}, status=error.status)


class LoadView(APIView):
    """Starts loading in the background (202); the panel polls the state."""

    @extend_schema(
        request=ConfirmSerializer, responses={202: SampleStateSerializer}, operation_id="sample_content_load"
    )
    def post(self, request: Request) -> Response:
        body = ConfirmSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if body.validated_data["confirm"] is not True:
            return Response({"code": "not_confirmed", "detail": "برای اجرا باید تأیید کنید."}, status=400)
        service.current_state()
        try:
            state = service.begin(SampleState.Status.LOADING, (SampleState.Status.EMPTY,))
        except service.SampleError as error:
            return _refused(error)
        load_sample_content.delay(request.user.pk, str(state.run_id))
        return Response(_state_body(), status=status.HTTP_202_ACCEPTED)


class UnloadView(APIView):
    @extend_schema(
        request=ConfirmSerializer, responses={202: SampleStateSerializer}, operation_id="sample_content_unload"
    )
    def post(self, request: Request) -> Response:
        body = ConfirmSerializer(data=request.data)
        body.is_valid(raise_exception=True)
        if body.validated_data["confirm"] is not True:
            return Response({"code": "not_confirmed", "detail": "برای اجرا باید تأیید کنید."}, status=400)
        service.current_state()
        try:
            state = service.begin(SampleState.Status.UNLOADING, (SampleState.Status.LOADED, SampleState.Status.FAILED))
        except service.SampleError as error:
            return _refused(error)
        unload_sample_content.delay(request.user.pk, str(state.run_id))
        return Response(_state_body(), status=status.HTTP_202_ACCEPTED)
