"""Settings shared by every environment. Values come from the environment only."""

from pathlib import Path

import environ

BASE_DIR = Path(__file__).resolve().parents[2]

env = environ.Env()

SECRET_KEY = env("DJANGO_SECRET_KEY")
DEBUG = False
# Internal names are always allowed: container health checks and service-to-service calls.
ALLOWED_HOSTS = [*env.list("DJANGO_ALLOWED_HOSTS", default=[]), "127.0.0.1", "localhost", "api"]
PUBLIC_URL = env("PUBLIC_URL", default="http://localhost:8080")
APP_VERSION = env("APP_VERSION", default="dev")

INSTALLED_APPS = [
    "django.contrib.admin",
    "django.contrib.auth",
    "django.contrib.contenttypes",
    "django.contrib.sessions",
    "django.contrib.messages",
    "django.contrib.staticfiles",
    "rest_framework",
    "drf_spectacular",
    "django_otp",
    "django_otp.plugins.otp_totp",
    "django_otp.plugins.otp_static",
    "axes",
    "apps.core",
    "apps.accounts",
    "apps.audit",
    "apps.media",
    "apps.cms",
    "apps.portfolio",
    "apps.pricing",
    "apps.blog",
    "apps.inquiries",
]

AUTH_USER_MODEL = "accounts.User"
AUTHENTICATION_BACKENDS = [
    "axes.backends.AxesStandaloneBackend",
    "django.contrib.auth.backends.ModelBackend",
]

# Number of reverse proxies that append to X-Forwarded-For in front of Django
# (production: Coolify's Traefik + the Caddy gateway).
TRUSTED_PROXY_COUNT = env.int("TRUSTED_PROXY_COUNT", default=2)

AXES_FAILURE_LIMIT = 5
AXES_COOLOFF_TIME = 0.25  # hours
AXES_LOCKOUT_PARAMETERS = [["username", "ip_address"]]
AXES_RESET_ON_SUCCESS = True
AXES_CLIENT_IP_CALLABLE = "apps.accounts.ip.axes_client_ip"
AXES_LOCKOUT_CALLABLE = "apps.accounts.api.lockout_response"
AXES_VERBOSE = False

OTP_TOTP_ISSUER = "3evda.com"

MIDDLEWARE = [
    "apps.core.middleware.RequestIDMiddleware",
    "django.middleware.security.SecurityMiddleware",
    "whitenoise.middleware.WhiteNoiseMiddleware",
    "django.contrib.sessions.middleware.SessionMiddleware",
    "django.middleware.locale.LocaleMiddleware",
    "django.middleware.common.CommonMiddleware",
    "django.middleware.csrf.CsrfViewMiddleware",
    "django.contrib.auth.middleware.AuthenticationMiddleware",
    "django_otp.middleware.OTPMiddleware",
    "django.contrib.messages.middleware.MessageMiddleware",
    "django.middleware.clickjacking.XFrameOptionsMiddleware",
    "axes.middleware.AxesMiddleware",
]

ROOT_URLCONF = "config.urls"
WSGI_APPLICATION = "config.wsgi.application"

TEMPLATES = [
    {
        "BACKEND": "django.template.backends.django.DjangoTemplates",
        "DIRS": [],
        "APP_DIRS": True,
        "OPTIONS": {
            "context_processors": [
                "django.template.context_processors.request",
                "django.contrib.auth.context_processors.auth",
                "django.contrib.messages.context_processors.messages",
            ],
        },
    },
]

DATABASES = {
    "default": {
        "ENGINE": "django.db.backends.postgresql",
        "NAME": env("POSTGRES_DB"),
        "USER": env("POSTGRES_USER"),
        "PASSWORD": env("POSTGRES_PASSWORD"),
        "HOST": env("POSTGRES_HOST", default="postgres"),
        "PORT": env.int("POSTGRES_PORT", default=5432),
        "CONN_MAX_AGE": 60,
        "CONN_HEALTH_CHECKS": True,
        "OPTIONS": {"connect_timeout": 5},
    }
}
DEFAULT_AUTO_FIELD = "django.db.models.BigAutoField"

AUTH_PASSWORD_VALIDATORS = [
    {"NAME": "django.contrib.auth.password_validation.UserAttributeSimilarityValidator"},
    {"NAME": "django.contrib.auth.password_validation.MinimumLengthValidator", "OPTIONS": {"min_length": 12}},
    {"NAME": "django.contrib.auth.password_validation.CommonPasswordValidator"},
    {"NAME": "django.contrib.auth.password_validation.NumericPasswordValidator"},
]

LANGUAGE_CODE = "fa"
LANGUAGES = [("fa", "فارسی"), ("en", "English")]
TIME_ZONE = "Asia/Tehran"
USE_I18N = True
USE_TZ = True

STATIC_URL = "/static/"
STATIC_ROOT = BASE_DIR / "staticfiles"

REDIS_URL = env("REDIS_URL", default="redis://redis:6379/0")

CACHES = {
    "default": {
        "BACKEND": "django.core.cache.backends.redis.RedisCache",
        "LOCATION": env("CACHE_URL", default=REDIS_URL.rsplit("/", 1)[0] + "/1"),
        "TIMEOUT": 300,
    }
}

SESSION_COOKIE_NAME = "threevda_session"
SESSION_COOKIE_AGE = 60 * 60 * 12

# Object storage (S3 API). Originals and archives live in the private bucket;
# the public bucket only holds derived, metadata-stripped variants.
S3_ENDPOINT_URL = env("S3_ENDPOINT_URL", default="http://storage:8333")
S3_ACCESS_KEY = env("S3_ACCESS_KEY")
S3_SECRET_KEY = env("S3_SECRET_KEY")
S3_REGION = env("S3_REGION", default="us-east-1")
S3_PRIVATE_BUCKET = env("S3_PRIVATE_BUCKET", default="private")
S3_PUBLIC_BUCKET = env("S3_PUBLIC_BUCKET", default="public")
S3_TIMEOUT_SECONDS = 3

STORAGES = {
    "default": {"BACKEND": "apps.core.storage.PrivateStorage"},
    "public": {"BACKEND": "apps.core.storage.PublicStorage"},
    "staticfiles": {"BACKEND": "whitenoise.storage.CompressedManifestStaticFilesStorage"},
}

# Media uploads and processing
MEDIA_MAX_IMAGE_BYTES = env.int("MEDIA_MAX_IMAGE_BYTES", default=50 * 1024 * 1024)
MEDIA_MAX_VIDEO_BYTES = env.int("MEDIA_MAX_VIDEO_BYTES", default=100 * 1024 * 1024)
MEDIA_MAX_PIXELS = env.int("MEDIA_MAX_PIXELS", default=150_000_000)
MEDIA_IMAGE_WIDTHS = [480, 960, 1600, 2400]
MEDIA_ARTIST = env("MEDIA_ARTIST", default="Sevda Rahimpour")
MEDIA_COPYRIGHT = env("MEDIA_COPYRIGHT", default="(c) Sevda Rahimpour - 3evda.com")
DATA_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024  # larger request bodies are streamed to temporary files
FILE_UPLOAD_MAX_MEMORY_SIZE = 5 * 1024 * 1024

CELERY_BROKER_URL = REDIS_URL
CELERY_RESULT_BACKEND = None
CELERY_TASK_ACKS_LATE = True
CELERY_WORKER_PREFETCH_MULTIPLIER = 1
CELERY_TIMEZONE = TIME_ZONE

REST_FRAMEWORK = {
    "DEFAULT_SCHEMA_CLASS": "drf_spectacular.openapi.AutoSchema",
    "DEFAULT_AUTHENTICATION_CLASSES": ["rest_framework.authentication.SessionAuthentication"],
    "DEFAULT_PERMISSION_CLASSES": ["apps.accounts.permissions.IsVerifiedOwner"],
    "NUM_PROXIES": TRUSTED_PROXY_COUNT,
    "DEFAULT_THROTTLE_RATES": {"login": "20/min", "otp": "10/min", "estimate": "60/min", "inquiry": "5/hour"},
    "EXCEPTION_HANDLER": "apps.core.errors.exception_handler",
    "DEFAULT_RENDERER_CLASSES": ["rest_framework.renderers.JSONRenderer"],
}

SPECTACULAR_SETTINGS = {
    "TITLE": "3evda API",
    "VERSION": "0.1.0",
    "SERVE_INCLUDE_SCHEMA": False,
    # The schema documents admin endpoints, so it is only served to staff.
    "SERVE_PERMISSIONS": ["apps.accounts.permissions.IsVerifiedOwner"],
    # Two models have a `status`; pin the names so the generated types (and the panel code) stay stable.
    "ENUM_NAME_OVERRIDES": {
        "StatusEnum": "apps.media.models.MediaAsset.Status",
        "ArticleStatusEnum": "apps.blog.models.Article.Status",
        "KindEnum": "apps.media.models.MediaAsset.Kind",
        "QuoteRuleKindEnum": "apps.pricing.models.QuoteRule.Kind",
        "InquiryStatusEnum": "apps.inquiries.models.Inquiry.Status",
    },
}

SECURE_CONTENT_TYPE_NOSNIFF = True
SECURE_REFERRER_POLICY = "strict-origin-when-cross-origin"
X_FRAME_OPTIONS = "DENY"
SESSION_COOKIE_HTTPONLY = True
SESSION_COOKIE_SAMESITE = "Lax"
CSRF_COOKIE_SAMESITE = "Lax"

LOGGING = {
    "version": 1,
    "disable_existing_loggers": False,
    "filters": {"request_id": {"()": "apps.core.logging.RequestIDFilter"}},
    "formatters": {"json": {"()": "apps.core.logging.JSONFormatter"}},
    "handlers": {
        "console": {"class": "logging.StreamHandler", "formatter": "json", "filters": ["request_id"]},
    },
    "root": {"handlers": ["console"], "level": env("LOG_LEVEL", default="INFO")},
}
