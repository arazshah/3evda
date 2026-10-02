from typing import Any

from axes.signals import user_locked_out
from django.contrib.auth.signals import user_logged_in, user_logged_out, user_login_failed
from django.dispatch import receiver
from django.http import HttpRequest

from apps.audit.service import record


@receiver(user_logged_in)
def _logged_in(sender: Any, request: HttpRequest | None, user: Any, **kwargs: Any) -> None:
    record("auth.login", request=request, actor=user)


@receiver(user_logged_out)
def _logged_out(sender: Any, request: HttpRequest | None, user: Any, **kwargs: Any) -> None:
    if user is not None:
        record("auth.logout", request=request, actor=user)


@receiver(user_login_failed)
def _login_failed(sender: Any, credentials: dict[str, Any], request: HttpRequest | None = None, **kwargs: Any) -> None:
    record("auth.login_failed", request=request, username=str(credentials.get("username", ""))[:150])


@receiver(user_locked_out)
def _locked_out(sender: Any, request: HttpRequest | None, username: str | None, **kwargs: Any) -> None:
    record("auth.locked_out", request=request, username=(username or "")[:150])
