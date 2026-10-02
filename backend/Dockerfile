# syntax=docker/dockerfile:1.7
# Mirrors (for servers without direct Docker Hub / PyPI access) are build args; defaults are public.
ARG BASE_REGISTRY=docker.io/library

FROM ${BASE_REGISTRY}/python:3.13-slim-bookworm AS build
ARG PIP_INDEX_URL=https://pypi.org/simple
ENV PIP_INDEX_URL=${PIP_INDEX_URL} \
    PIP_DISABLE_PIP_VERSION_CHECK=1 \
    PIP_NO_CACHE_DIR=1 \
    PYTHONDONTWRITEBYTECODE=1
WORKDIR /app
COPY requirements.txt ./
# Hashes in requirements.txt (exported from uv.lock) are verified whichever index serves the files.
RUN python -m venv /opt/venv \
 && /opt/venv/bin/pip install --require-hashes --no-deps -r requirements.txt
COPY . .
RUN DJANGO_SECRET_KEY=build-only-not-a-secret-build-only-not-a-secret-0000 \
    POSTGRES_DB=x POSTGRES_USER=x POSTGRES_PASSWORD=x S3_ACCESS_KEY=x S3_SECRET_KEY=x \
    /opt/venv/bin/python manage.py collectstatic --noinput --settings=config.settings.prod

FROM ${BASE_REGISTRY}/python:3.13-slim-bookworm AS runtime
ARG APP_VERSION=dev
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    APP_VERSION=${APP_VERSION}
RUN groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --from=build --chown=root:root /app /app
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/live', timeout=3)"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["web"]
