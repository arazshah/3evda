from unittest import mock

import pytest
from django.test import Client

from apps.core import health


@pytest.fixture
def client() -> Client:
    return Client()


def test_live_reports_ok_and_version_without_touching_dependencies(client, settings):
    settings.APP_VERSION = "abc123"
    with mock.patch.object(health, "check_database") as db:
        response = client.get("/api/health/live")

    assert response.status_code == 200
    assert response.json() == {"status": "ok", "version": "abc123"}
    assert response["Cache-Control"] == "no-store"
    db.assert_not_called()


def _all_ok():
    return mock.patch.multiple(
        health,
        check_database=mock.DEFAULT,
        check_redis=mock.DEFAULT,
        check_storage=mock.DEFAULT,
    )


def test_ready_is_ok_when_every_dependency_is_healthy(client):
    with _all_ok():
        response = client.get("/api/health/ready")

    assert response.status_code == 200
    assert response.json() == {
        "status": "ok",
        "checks": {"database": "ok", "redis": "ok", "storage": "ok"},
    }
    assert response["Cache-Control"] == "no-store"


def test_ready_is_503_and_names_only_the_failing_dependency(client):
    with _all_ok() as checks:
        checks["check_redis"].side_effect = ConnectionError("redis://secret@host refused")
        response = client.get("/api/health/ready")

    assert response.status_code == 503
    body = response.json()
    assert body == {
        "status": "unavailable",
        "checks": {"database": "ok", "redis": "error", "storage": "ok"},
    }
    assert "secret" not in response.content.decode()


@pytest.mark.django_db
def test_check_database_runs_a_real_query():
    health.check_database()
