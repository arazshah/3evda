import ipaddress

from django.conf import settings
from django.http import HttpRequest


def client_ip(request: HttpRequest) -> str | None:
    """The visitor's IP, read from the hop added by the last trusted proxy.

    X-Forwarded-For is appended to by each proxy, so entries left of the trusted hop can be forged by
    the client. With TRUSTED_PROXY_COUNT=N the client is the N-th entry from the right.
    """
    peer = request.META.get("REMOTE_ADDR")
    count = settings.TRUSTED_PROXY_COUNT
    hops = [h.strip() for h in request.META.get("HTTP_X_FORWARDED_FOR", "").split(",") if h.strip()]
    candidate = hops[-count] if count and len(hops) >= count else peer
    try:
        return str(ipaddress.ip_address(candidate or ""))
    except ValueError:
        return peer


def axes_client_ip(request: HttpRequest) -> str | None:
    return client_ip(request)
