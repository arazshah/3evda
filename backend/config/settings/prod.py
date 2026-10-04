from django.core.exceptions import ImproperlyConfigured

from .base import *  # noqa: F403
from .base import PUBLIC_URL, SECRET_KEY, env

if len(SECRET_KEY) < 50:
    raise ImproperlyConfigured("DJANGO_SECRET_KEY must be at least 50 characters")

DEBUG = False
CSRF_TRUSTED_ORIGINS = [PUBLIC_URL]

# TLS terminates at the Coolify proxy; the gateway forwards the original scheme.
SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
USE_X_FORWARDED_HOST = True
# Only the local compose stack and CI (plain http://localhost) turn this off.
SESSION_COOKIE_SECURE = CSRF_COOKIE_SECURE = env.bool("COOKIE_SECURE", default=True)
if SESSION_COOKIE_SECURE:
    # The "__Host-" prefix makes the browser accept the session cookie only if it is Secure, has no Domain and
    # covers the whole site, so no sibling host or insecure page can set or overwrite it. (Browsers refuse the
    # prefix on plain http, which is why local and CI stacks, that turn Secure off, keep the plain name.)
    SESSION_COOKIE_NAME = "__Host-threevda_session"
SECURE_HSTS_SECONDS = 60 * 60 * 24 * 365
SECURE_HSTS_INCLUDE_SUBDOMAINS = False
# Redirects to HTTPS are done by Coolify; doing it here would break internal health checks.
SECURE_SSL_REDIRECT = False
