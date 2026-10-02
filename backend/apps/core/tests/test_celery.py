from django.conf import settings

from apps.core.tasks import ping
from config.celery import app


def test_ping_task_runs_eagerly():
    assert ping.apply().get() == "pong"


def test_celery_uses_redis_from_django_settings():
    assert app.conf.broker_url == settings.REDIS_URL
    assert app.conf.timezone == "Asia/Tehran"
