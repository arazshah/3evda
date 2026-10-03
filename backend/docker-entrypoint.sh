#!/bin/sh
set -eu

case "${1:-web}" in
  web)
    python manage.py migrate --noinput
    python manage.py ensure_buckets
    # Optional: create the owner at start-up when ADMIN_BOOTSTRAP_PASSWORD is set (for hosts without a shell).
    # --if-missing makes an existing owner a no-op; any other failure (e.g. a weak password) stops the container.
    # Remove the variable after the first sign-in.
    if [ -n "${ADMIN_BOOTSTRAP_PASSWORD:-}" ]; then
      python manage.py bootstrap_admin --no-input --if-missing
    fi
    exec gunicorn config.wsgi:application \
      --bind 0.0.0.0:8000 \
      --workers "${GUNICORN_WORKERS:-3}" \
      --timeout 60 \
      --access-logfile - \
      --forwarded-allow-ips "*"
    ;;
  worker)
    exec celery -A config worker -B \
      --loglevel "${LOG_LEVEL:-INFO}" \
      --concurrency "${CELERY_CONCURRENCY:-2}" \
      --schedule /tmp/celerybeat-schedule
    ;;
  *)
    exec "$@"
    ;;
esac
