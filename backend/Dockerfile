# syntax=docker/dockerfile:1.7
# Mirrors (for servers without direct Docker Hub / PyPI access) are build args; defaults are public.
ARG BASE_REGISTRY=docker.io/library
# Tools for the `backup` target only (each is a static binary or a client taken from its official image).
ARG RESTIC_IMAGE=docker.io/restic/restic:0.18.0
ARG RCLONE_IMAGE=docker.io/rclone/rclone:1.69.3
ARG PG_CLIENT_IMAGE=${BASE_REGISTRY}/postgres:17-bookworm

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
# Optional Debian mirror, e.g. https://mirror.example.ir (replaces deb.debian.org).
ARG DEBIAN_MIRROR=
ENV PATH=/opt/venv/bin:$PATH \
    PYTHONDONTWRITEBYTECODE=1 \
    PYTHONUNBUFFERED=1 \
    DJANGO_SETTINGS_MODULE=config.settings.prod \
    APP_VERSION=${APP_VERSION} \
    HOME=/tmp
# ffmpeg: video metadata stripping and posters. libfribidi0: Persian text shaping for watermarks
# (Pillow's bundled raqm loads it at runtime).
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
 && apt-get update \
 && apt-get install --yes --no-install-recommends ffmpeg libfribidi0 libpango-1.0-0 libpangoft2-1.0-0 libharfbuzz-subset0 \
 && rm -rf /var/lib/apt/lists/* \
 && groupadd --gid 10001 app && useradd --uid 10001 --gid app --no-create-home --shell /usr/sbin/nologin app
WORKDIR /app
COPY --from=build /opt/venv /opt/venv
COPY --from=build --chown=root:root /app /app
USER 10001:10001
EXPOSE 8000
HEALTHCHECK --interval=15s --timeout=5s --start-period=30s --retries=3 \
  CMD ["python", "-c", "import urllib.request; urllib.request.urlopen('http://127.0.0.1:8000/api/health/live', timeout=3)"]
ENTRYPOINT ["/app/docker-entrypoint.sh"]
CMD ["web"]

# The nightly backup service: the same app, plus restic, rclone and the PostgreSQL 17 client tools
# (pg_dump must be at least as new as the server). Build with `target: backup`; the default target stays `runtime`.
FROM ${RESTIC_IMAGE} AS restic
FROM ${RCLONE_IMAGE} AS rclone
FROM ${PG_CLIENT_IMAGE} AS pgclient

FROM runtime AS backup
ARG DEBIAN_MIRROR=
USER root
# libpq 17 comes from the PostgreSQL image; it needs the Kerberos and LDAP libraries Debian provides.
RUN if [ -n "$DEBIAN_MIRROR" ]; then \
      sed -i "s|http://deb.debian.org|${DEBIAN_MIRROR}|g" /etc/apt/sources.list.d/debian.sources; \
    fi \
 && apt-get update \
 && apt-get install --yes --no-install-recommends libgssapi-krb5-2 libldap-2.5-0 ca-certificates openssh-client \
 && rm -rf /var/lib/apt/lists/*
COPY --from=restic /usr/bin/restic /usr/local/bin/restic
COPY --from=rclone /usr/local/bin/rclone /usr/local/bin/rclone
COPY --from=pgclient /usr/lib/postgresql/17/bin/pg_dump /usr/lib/postgresql/17/bin/pg_restore \
     /usr/lib/postgresql/17/bin/psql /usr/lib/postgresql/17/bin/createdb /usr/lib/postgresql/17/bin/dropdb /usr/local/bin/
COPY --from=pgclient /usr/lib/x86_64-linux-gnu/libpq.so.5* /usr/lib/x86_64-linux-gnu/
RUN mkdir -p /backups && chown 10001:10001 /backups && chmod +x /app/scripts/restore.sh \
 && ln -s /app/scripts/restore.sh /usr/local/bin/restore
USER 10001:10001
VOLUME ["/backups"]
HEALTHCHECK NONE
