from apps.core.tasks import ping


def test_ping_task_runs_eagerly(settings):
    assert ping.apply().get() == "pong"
