import hashlib
import hmac

from django.conf import settings
from django.http import HttpRequest

from apps.accounts.ip import client_ip


def ip_digest(request: HttpRequest, scope: str) -> str:
    """HMAC of the visitor's IP under a scope: enough to tell one source from another within that feature,
    but the address itself is never stored (and digests from different features cannot be compared)."""
    ip = client_ip(request) or ""
    if not ip:
        return ""
    return hmac.new(settings.SECRET_KEY.encode(), f"{scope}-ip:{ip}".encode(), hashlib.sha256).hexdigest()
