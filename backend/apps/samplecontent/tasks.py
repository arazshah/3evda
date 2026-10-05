from typing import Any
from uuid import UUID

from celery import shared_task
from django.contrib.auth import get_user_model

from . import service


@shared_task(acks_late=False)
def load_sample_content(user_id: int | None = None, run_id: str | None = None) -> dict[str, int]:
    user: Any = get_user_model().objects.filter(pk=user_id).first() if user_id else None
    try:
        return service.run_load(user, UUID(run_id) if run_id else None)
    except service.SampleError:
        return {}  # already recorded in the state


@shared_task(acks_late=False)
def unload_sample_content(user_id: int | None = None, run_id: str | None = None) -> dict[str, int]:
    user: Any = get_user_model().objects.filter(pk=user_id).first() if user_id else None
    return service.run_unload(user, UUID(run_id) if run_id else None)
