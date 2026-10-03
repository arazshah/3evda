from typing import Any

from django.db import models
from django.http import HttpRequest

from apps.accounts.ip import client_ip
from apps.core.logging import request_id_var

from .models import AuditLog


def record(
    action: str,
    *,
    request: HttpRequest | None = None,
    actor: Any = None,
    target: models.Model | None = None,
    **metadata: Any,
) -> AuditLog:
    """Append an audit entry. Never pass secrets, passwords or full message bodies as metadata."""
    if actor is None and request is not None:
        user = getattr(request, "user", None)
        actor = user if user is not None and user.is_authenticated else None
    request_id = request_id_var.get()
    return AuditLog.objects.create(
        action=action,
        actor=actor,
        target_type=target._meta.label_lower if target is not None else "",
        target_id=str(target.pk) if target is not None else "",
        ip=client_ip(request) if request is not None else None,
        request_id="" if request_id == "-" else request_id,
        metadata=metadata,
    )
