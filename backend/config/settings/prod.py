from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import PUBLIC_URL, SECRET_KEY

if len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be at least 50 characters")

DEBUG = False
CSRF_TRUSTED_ORIGINS = [PUBLIC_URL]

# TLS terminates at the Coolify proxy; the gateway forwards the original scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 30
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
# Redirects to HTTPS are done by Coolify; doing it here would break internal health checks.
SECURE_SSL_REDIRECT = False
