import json
import subprocess
from pathlib import Path
from types import SimpleNamespace

import pytest
from rest_framework.test import APIClient

from apps.core import backup, backup_window
from apps.core.middleware import BACKUP_RETRY_AFTER_SECONDS

pytestmark = pytest.mark.django_db

ENV = {"RESTIC_PASSWORD": "pw", "PATH": "/usr/bin"}


class Recorder:
    """A stand-in for subprocess.run that records every command and can fail on one."""

    def __init__(self, fail_on: str | None = None, snapshots: str = '[{"short_id": "abc123"}]') -> None:
        self.calls: list[list[str]] = []
        self.envs: list[dict[str, str]] = []
        self.fail_on = fail_on
        self.snapshots = snapshots
        self.window_during_copy: list[bool] = []

    def __call__(self, argv, env=None, **kwargs):  # type: ignore[no-untyped-def]
        self.calls.append(argv)
        self.envs.append(env or {})
        name = " ".join(argv[:2])
        if argv[0] in ("pg_dump", "rclone"):
            self.window_during_copy.append(backup_window.is_open())
        if argv[:3] == ["restic", "cat", "config"] and self.fail_on == "no-repo":
            raise subprocess.CalledProcessError(1, argv, stderr="no repository")
        if self.fail_on and name.startswith(self.fail_on):
            raise subprocess.CalledProcessError(1, argv, stderr="boom: it broke")
        if argv[0] == "pg_dump":
            Path(argv[argv.index("--file") + 1]).write_bytes(b"dump")
        if argv[0] == "rclone":
            target = Path(argv[3])
            target.mkdir(parents=True, exist_ok=True)
            (target / "photo.webp").write_bytes(b"x" * 10)
        return SimpleNamespace(stdout=self.snapshots if argv[:2] == ["restic", "snapshots"] else "", stderr="")

    def commands(self) -> list[str]:
        return [" ".join(c[:2]) for c in self.calls]


class Worker:
    def __init__(self) -> None:
        self.events: list[str] = []

    def pause(self) -> None:
        self.events.append(f"pause window={backup_window.is_open()}")

    def resume(self) -> None:
        self.events.append(f"resume window={backup_window.is_open()}")

    def idle(self) -> None:
        self.events.append("idle")


def run(tmp_path, recorder=None, worker=None, **kw):  # type: ignore[no-untyped-def]
    recorder = recorder or Recorder()
    worker = worker or Worker()
    written: list[backup.BackupStatus] = []
    options = {
        "environ": ENV,
        "pause": worker.pause,
        "resume": worker.resume,
        "idle": worker.idle,
        "status_writer": written.append,
        **kw,
    }
    status = backup.run_backup(runner=recorder, workdir=tmp_path / "work", **options)
    return status, recorder, worker, written


# ---- the window ------------------------------------------------------------------------------------


def test_the_window_key_has_its_own_expiry(fake_redis):
    backup_window.open_window()
    _, ttl = fake_redis.store[backup_window.WINDOW_KEY]
    assert ttl == backup_window.WINDOW_TTL_SECONDS == 1800  # a backup that dies cannot lock the site for long
    assert backup_window.is_open()
    backup_window.close_window()
    assert not backup_window.is_open()


def test_writes_are_refused_with_503_and_retry_after_while_the_window_is_open():
    client = APIClient()
    backup_window.open_window()
    r = client.post("/api/public/inquiries", {}, format="json")
    assert r.status_code == 503
    assert r["Retry-After"] == str(BACKUP_RETRY_AFTER_SECONDS)
    assert r.json()["code"] == "backup_in_progress"
    for method in ("put", "patch", "delete"):
        assert getattr(client, method)("/api/admin/galleries/1/").status_code == 503


def test_reading_and_health_work_during_the_window(owner_client):
    backup_window.open_window()
    assert APIClient().get("/api/health/live").status_code == 200
    assert APIClient().get("/api/public/booking/options").status_code == 200
    assert owner_client.get("/api/auth/me").status_code == 200


def test_writes_work_again_once_the_window_closes():
    backup_window.open_window()
    assert APIClient().post("/api/public/inquiries", {}, format="json").status_code == 503
    backup_window.close_window()
    assert APIClient().post("/api/public/inquiries", {}, format="json").status_code != 503


def test_a_redis_that_is_down_does_not_make_the_site_read_only(monkeypatch):
    import redis

    def broken():  # type: ignore[no-untyped-def]
        raise redis.ConnectionError("down")

    monkeypatch.setattr(backup_window, "_client", broken)
    assert backup_window.is_open() is False
    assert APIClient().post("/api/public/inquiries", {}, format="json").status_code != 503


# ---- the run ---------------------------------------------------------------------------------------


def test_a_good_run_in_the_right_order(tmp_path):
    status, rec, worker, written = run(tmp_path)
    assert status.ok and status.snapshot == "abc123" and status.size_bytes > 0
    # database first, then both buckets, then the encrypted snapshot, then the retention policy
    assert rec.commands() == [
        "pg_dump --format=custom",
        "rclone sync",
        "rclone sync",
        "restic cat",
        "restic backup",
        "restic snapshots",
        "restic forget",
    ]
    forget = next(c for c in rec.calls if c[:2] == ["restic", "forget"])
    assert forget[forget.index("--keep-daily") + 1] == "7"
    assert forget[forget.index("--keep-weekly") + 1] == "4"
    assert "--prune" in forget
    # the worker was stopped inside the window and let go after the copy, and the window ended with it
    assert worker.events == ["pause window=True", "idle", "resume window=True"]
    assert not backup_window.is_open()
    assert written == [status]
    assert status.steps[-1] == "snapshot"
    assert not (tmp_path / "work").exists()  # the plain copy does not stay on disk


def test_the_copy_happens_inside_the_window(tmp_path):
    _, rec, *_ = run(tmp_path)
    assert rec.window_during_copy == [True, True, True]


def test_buckets_are_copied_with_the_status_file_left_out(tmp_path):
    _, rec, *_ = run(tmp_path)
    syncs = [c for c in rec.calls if c[:2] == ["rclone", "sync"]]
    assert [c[2] for c in syncs] == ["store:private", "store:public"]
    assert all(c[c.index("--exclude") + 1] == "_system/**" for c in syncs)


def test_secrets_go_through_the_environment_not_the_command_line(tmp_path, settings, monkeypatch):
    settings.S3_SECRET_KEY = "very-secret-key"
    monkeypatch.setitem(settings.DATABASES["default"], "PASSWORD", "db-secret")
    _, rec, *_ = run(tmp_path)
    assert all("very-secret-key" not in " ".join(c) and "db-secret" not in " ".join(c) for c in rec.calls)
    rclone_env = rec.envs[next(i for i, c in enumerate(rec.calls) if c[0] == "rclone")]
    assert rclone_env["RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY"] == "very-secret-key"
    dump_env = rec.envs[0]
    assert dump_env["PGPASSWORD"] == "db-secret"


def test_the_repository_is_created_the_first_time(tmp_path):
    status, rec, *_ = run(tmp_path, recorder=Recorder(fail_on="no-repo"))
    assert status.ok
    assert "restic init" in rec.commands()
    assert rec.commands().index("restic init") < rec.commands().index("restic backup")


def test_no_password_means_no_backup(tmp_path):
    status, rec, worker, written = run(tmp_path, environ={"PATH": "/usr/bin"})
    assert not status.ok and "RESTIC_PASSWORD" in status.message
    assert rec.calls == [] and worker.events == []  # nothing was touched, the site was never paused
    assert not backup_window.is_open()
    assert written == [status]


def test_the_default_repository_is_the_backup_volume():
    assert backup.restic_env({"RESTIC_PASSWORD": "x"})["RESTIC_REPOSITORY"] == "/backups/repo"
    assert (
        backup.restic_env({"RESTIC_PASSWORD": "x", "BACKUP_REPOSITORY": "sftp:u@h:/b"})["RESTIC_REPOSITORY"]
        == "sftp:u@h:/b"
    )


@pytest.mark.parametrize("failing", ["pg_dump", "rclone sync", "restic backup", "restic forget"])
def test_a_failing_step_is_reported_never_silent(tmp_path, failing):
    status, _, _, written = run(tmp_path, recorder=Recorder(fail_on=failing))
    assert not status.ok
    assert "boom" in status.message
    assert written and written[0].ok is False


@pytest.mark.parametrize("failing", ["pg_dump", "rclone sync"])
def test_the_worker_always_resumes_and_the_window_always_closes(tmp_path, failing):
    status, _, worker, _ = run(tmp_path, recorder=Recorder(fail_on=failing))
    assert not status.ok
    assert worker.events[-1].startswith("resume")
    assert not backup_window.is_open()
    assert status.steps[-2:] == ["worker-resumed", "window-closed"]


def test_jobs_that_never_finish_fail_the_backup_and_release_everything(tmp_path):
    def stuck() -> None:
        raise backup.BackupError("کارهای پس‌زمینه در ۱۰ دقیقه تمام نشدند")

    worker = Worker()
    status, rec, _, _ = run(tmp_path, worker=worker, idle=stuck)
    assert not status.ok and "۱۰ دقیقه" in status.message
    assert rec.calls == []  # nothing was copied
    assert worker.events[-1].startswith("resume")
    assert not backup_window.is_open()


def test_resume_failing_still_closes_the_window(tmp_path):
    class Broken(Worker):
        def resume(self) -> None:
            raise RuntimeError("broker down")

    status, *_ = run(tmp_path, worker=Broken())
    assert not status.ok
    assert not backup_window.is_open()


def test_wait_for_idle_waits_then_gives_up():
    counts = iter([2, 1, 0])
    naps: list[float] = []
    backup.wait_for_idle(60, busy=lambda: next(counts), sleep=naps.append, clock=lambda: 0.0)
    assert len(naps) == 2

    now = [0.0]

    def clock() -> float:
        now[0] += 400
        return now[0]

    with pytest.raises(backup.BackupError):
        backup.wait_for_idle(600, busy=lambda: 1, sleep=lambda s: None, clock=clock)


# ---- the status file -------------------------------------------------------------------------------


def test_status_file_round_trip_in_the_private_bucket(s3_buckets, settings):
    status = backup.BackupStatus(True, "2026-10-04T03:05:00+03:30", "ok", "abc", 123, 4.2, ["snapshot"])
    backup.write_status(status, s3_buckets)
    raw = s3_buckets.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=backup.STATUS_KEY)["Body"].read()
    assert json.loads(raw)["snapshot"] == "abc"
    assert backup.read_status(s3_buckets)["ok"] is True


def test_a_failed_run_writes_ok_false_to_the_status_file(s3_buckets, tmp_path, settings):
    rec = Recorder(fail_on="pg_dump")
    backup.run_backup(
        runner=rec, environ=ENV, pause=lambda: None, resume=lambda: None, idle=lambda: None, workdir=tmp_path / "w"
    )
    saved = backup.read_status(s3_buckets)
    assert saved["ok"] is False and "boom" in saved["message"]


def test_no_status_file_reads_as_none(s3_buckets):
    assert backup.read_status(s3_buckets) is None


def test_garbage_status_reads_as_none(s3_buckets, settings):
    s3_buckets.put_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=backup.STATUS_KEY, Body=b"not json")
    assert backup.read_status(s3_buckets) is None


def test_a_status_write_failure_does_not_crash_the_run(tmp_path):
    def broken(_: backup.BackupStatus) -> None:
        raise RuntimeError("storage down")

    status, *_ = run(tmp_path, status_writer=broken)
    assert status.ok


# ---- the schedule ----------------------------------------------------------------------------------


def test_the_next_run_is_at_three_in_the_morning_tehran():
    from datetime import UTC, datetime
    from zoneinfo import ZoneInfo

    tehran = ZoneInfo("Asia/Tehran")
    before = datetime(2026, 10, 4, 1, 0, tzinfo=tehran)
    after = datetime(2026, 10, 4, 4, 0, tzinfo=tehran)
    assert backup.seconds_until(3, before.astimezone(UTC)) == 2 * 3600
    assert backup.seconds_until(3, after.astimezone(UTC)) == 23 * 3600


def test_retention_is_seven_daily_and_four_weekly():
    assert backup.retention_args() == ["--keep-daily", "7", "--keep-weekly", "4", "--prune"]


def test_the_heartbeat_file_is_touched_for_the_health_check(tmp_path, monkeypatch):
    from apps.core.management.commands import run_backup

    beat = tmp_path / "beat"
    monkeypatch.setattr(run_backup, "HEARTBEAT", beat)

    class Stop(Exception):
        pass

    def stop(_: float) -> None:
        raise Stop

    monkeypatch.setattr(run_backup.time, "sleep", stop)
    with pytest.raises(Stop):
        run_backup.heartbeat_forever()
    assert beat.exists()
