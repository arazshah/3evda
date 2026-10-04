"""The nightly backup, in one place so every step can be tested without restic or a real server.

Order matters (see docs/superpowers/plans/2026-10-04-phase-7-hardening-release.md):

1. open the backup window (the API refuses writes; the running backup keeps renewing it) and stop the worker
   taking jobs;
2. wait for requests and jobs already running to finish;
3. dump the database first, then copy the files (a file with no row is harmless, a row with no file is not);
4. whatever happened, close the window and let the worker go on;
5. only then encrypt the copy into the restic repository and apply the retention policy.

The result — success or failure, with a message — is written as a small JSON file into the private bucket,
where the panel's status card reads it. A failure is never silent.
"""

import json
import logging
import os
import shutil
import subprocess
import time
from collections.abc import Callable, Mapping, Sequence
from dataclasses import asdict, dataclass, field
from datetime import datetime, timedelta
from pathlib import Path
from typing import Any

from django.conf import settings
from django.utils import timezone

from . import backup_window

logger = logging.getLogger(__name__)

STATUS_KEY = "_system/backup-status.json"
QUEUES = ("celery", "galleries")
KEEP_DAILY = 7
KEEP_WEEKLY = 4
IDLE_TIMEOUT_SECONDS = 10 * 60
DEFAULT_REPOSITORY = "/backups/repo"
DEFAULT_WORKDIR = "/backups/work"


class BackupError(Exception):
    """A backup step failed; the message is shown to the owner in the panel."""


class BackupConfigError(BackupError):
    """The service is not set up (for instance, no repository password)."""


Runner = Callable[..., Any]


@dataclass
class BackupStatus:
    ok: bool
    at: str
    message: str
    snapshot: str = ""
    size_bytes: int = 0
    duration_seconds: float = 0.0
    steps: list[str] = field(default_factory=list)


def retention_args() -> list[str]:
    """Seven daily and four weekly snapshots are kept; everything older is removed from the repository."""
    return ["--keep-daily", str(KEEP_DAILY), "--keep-weekly", str(KEEP_WEEKLY), "--prune"]


def restic_env(environ: Mapping[str, str] | None = None) -> dict[str, str]:
    env = dict(os.environ if environ is None else environ)
    if not env.get("RESTIC_PASSWORD"):
        raise BackupConfigError("RESTIC_PASSWORD تنظیم نشده است؛ پشتیبان‌گیری بدون آن شروع نمی‌شود.")
    env.setdefault("RESTIC_REPOSITORY", env.get("BACKUP_REPOSITORY") or DEFAULT_REPOSITORY)
    # Credentials for an off-server repository, under names that are easy to recognise in Coolify.
    for ours, theirs in (
        ("BACKUP_S3_ACCESS_KEY", "AWS_ACCESS_KEY_ID"),
        ("BACKUP_S3_SECRET_KEY", "AWS_SECRET_ACCESS_KEY"),
        ("BACKUP_S3_REGION", "AWS_DEFAULT_REGION"),
    ):
        if env.get(ours):
            env[theirs] = env[ours]
    return env


def prepare_ssh(environ: Mapping[str, str] | None = None) -> bool:
    """For an `sftp:` repository: writes the private key and the server's fingerprint where ssh looks.

    The key arrives as an environment variable (Coolify has no file upload), with `\n` standing for line breaks.
    The host key is mandatory: nothing is ever sent to a server that was not recognised.
    """
    env = os.environ if environ is None else environ
    key = env.get("BACKUP_SSH_KEY", "")
    if not key:
        return False
    hosts = env.get("BACKUP_SSH_KNOWN_HOSTS", "")
    if not hosts:
        raise BackupConfigError("BACKUP_SSH_KNOWN_HOSTS تنظیم نشده است؛ بدون اثر انگشت سرور اتصال برقرار نمی‌شود.")
    ssh = Path(env.get("HOME") or "/tmp") / ".ssh"  # noqa: S108 — the container's home
    ssh.mkdir(mode=0o700, parents=True, exist_ok=True)
    (ssh / "id_backup").write_text(key.replace("\\n", "\n").strip() + "\n")
    (ssh / "id_backup").chmod(0o600)
    (ssh / "known_hosts").write_text(hosts.replace("\\n", "\n").strip() + "\n")
    (ssh / "config").write_text(
        "Host *\n"
        f"  IdentityFile {ssh / 'id_backup'}\n"
        f"  UserKnownHostsFile {ssh / 'known_hosts'}\n"
        "  StrictHostKeyChecking yes\n"
        "  BatchMode yes\n"
    )
    return True


def rclone_env(base: Mapping[str, str]) -> dict[str, str]:
    """rclone reads the storage service from the environment, so no config file (and no secret) is written."""
    env = dict(base)
    env.update(
        RCLONE_CONFIG_STORE_TYPE="s3",
        RCLONE_CONFIG_STORE_PROVIDER="Other",
        RCLONE_CONFIG_STORE_ENDPOINT=settings.S3_ENDPOINT_URL,
        RCLONE_CONFIG_STORE_ACCESS_KEY_ID=settings.S3_ACCESS_KEY,
        RCLONE_CONFIG_STORE_SECRET_ACCESS_KEY=settings.S3_SECRET_KEY,
        RCLONE_CONFIG_STORE_REGION=settings.S3_REGION,
    )
    return env


def pg_env(base: Mapping[str, str]) -> dict[str, str]:
    db = settings.DATABASES["default"]
    env = dict(base)
    env.update(
        PGHOST=str(db["HOST"]),
        PGPORT=str(db.get("PORT") or "5432"),
        PGUSER=str(db["USER"]),
        PGPASSWORD=str(db["PASSWORD"]),
        PGDATABASE=str(db["NAME"]),
    )
    return env


def buckets() -> list[str]:
    return [settings.S3_PRIVATE_BUCKET, settings.S3_PUBLIC_BUCKET]


# ---- the worker -----------------------------------------------------------------------------------------


def _celery_app() -> Any:
    from config.celery import app

    return app


def pause_worker() -> None:
    control = _celery_app().control
    for queue in QUEUES:
        control.cancel_consumer(queue, reply=True)


def resume_worker() -> None:
    control = _celery_app().control
    for queue in QUEUES:
        control.add_consumer(queue, reply=True)


def busy_jobs() -> int:
    """Jobs the worker is running or has already taken (it takes one ahead)."""
    inspector = _celery_app().control.inspect(timeout=3)
    total = 0
    for report in (inspector.active(), inspector.reserved()):
        for tasks in (report or {}).values():
            total += len(tasks)
    return total


def wait_for_writes(timeout: float = backup_window.WRITES_TIMEOUT_SECONDS) -> None:
    if not backup_window.wait_for_writes(timeout):
        raise BackupError("درخواست‌های در حال ثبت تمام نشدند؛ پشتیبان‌گیری امشب انجام نشد.")


def recover() -> None:
    """On start-up: whatever a previous run left behind (a worker told to stop, a window key) is undone.

    A backup process that was killed never reached its clean-up, and the worker would otherwise stay deaf
    until the next night.
    """
    backup_window.close_window()
    try:
        resume_worker()
    except Exception:
        logger.warning("could not resume the worker at start-up (it may not be running yet)")


def wait_for_idle(
    timeout: float = IDLE_TIMEOUT_SECONDS,
    *,
    busy: Callable[[], int] = busy_jobs,
    sleep: Callable[[float], None] = time.sleep,
    clock: Callable[[], float] = time.monotonic,
) -> None:
    deadline = clock() + timeout
    while busy():
        if clock() >= deadline:
            raise BackupError("کارهای پس‌زمینه در ۱۰ دقیقه تمام نشدند؛ پشتیبان‌گیری امشب انجام نشد.")
        sleep(5)


# ---- the copy -------------------------------------------------------------------------------------------


def _run(runner: Runner, argv: Sequence[str], env: Mapping[str, str], what: str) -> str:
    try:
        done = runner(list(argv), env=dict(env), check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError as exc:
        detail = (exc.stderr or exc.stdout or "").strip().splitlines()[-1:] or [""]
        raise BackupError(f"{what} ناموفق بود: {detail[0][:300]}") from exc
    except OSError as exc:
        raise BackupError(f"{what} ناموفق بود: {exc}") from exc
    return str(getattr(done, "stdout", "") or "")


def copy_data(workdir: Path, env: Mapping[str, str], runner: Runner) -> None:
    """Database first, then files."""
    if workdir.exists():
        shutil.rmtree(workdir)
    workdir.mkdir(parents=True)
    _run(
        runner,
        ["pg_dump", "--format=custom", "--no-owner", "--file", str(workdir / "db.dump")],
        pg_env(env),
        "dump پایگاه‌داده",
    )
    rc_env = rclone_env(env)
    for bucket in buckets():
        argv = ["rclone", "sync", f"store:{bucket}", str(workdir / "objects" / bucket), "--exclude", "_system/**"]
        _run(runner, argv, rc_env, f"کپی فایل‌های «{bucket}»")


def ensure_repository(env: Mapping[str, str], runner: Runner) -> None:
    try:
        runner(["restic", "cat", "config"], env=dict(env), check=True, capture_output=True, text=True)
    except subprocess.CalledProcessError:
        _run(runner, ["restic", "init"], env, "ساخت مخزن پشتیبان")


def snapshot_and_prune(workdir: Path, env: Mapping[str, str], runner: Runner) -> str:
    ensure_repository(env, runner)
    _run(
        runner, ["restic", "backup", "--tag", "nightly", "--host", "threevda", str(workdir)], env, "ذخیره‌ی رمزنگاری‌شده"
    )
    out = _run(runner, ["restic", "snapshots", "--latest", "1", "--json", "--tag", "nightly"], env, "خواندن snapshot")
    _run(runner, ["restic", "forget", "--tag", "nightly", *retention_args()], env, "پاک‌سازی نسخه‌های قدیمی")
    try:
        return str(json.loads(out)[-1]["short_id"])
    except (ValueError, LookupError, TypeError):
        return ""


def directory_size(path: Path) -> int:
    return sum(p.stat().st_size for p in path.rglob("*") if p.is_file())


# ---- the status file ------------------------------------------------------------------------------------


def write_status(status: BackupStatus, client: Any = None) -> None:
    if client is None:
        from .health import s3_client

        client = s3_client()
    client.put_object(
        Bucket=settings.S3_PRIVATE_BUCKET,
        Key=STATUS_KEY,
        Body=json.dumps(asdict(status), ensure_ascii=False).encode(),
        ContentType="application/json",
    )


def read_status(client: Any = None) -> dict[str, Any] | None:
    if client is None:
        from .health import s3_client

        client = s3_client()
    try:
        body = client.get_object(Bucket=settings.S3_PRIVATE_BUCKET, Key=STATUS_KEY)["Body"].read()
        data = json.loads(body)
    except Exception:
        return None
    return data if isinstance(data, dict) else None


# ---- the whole run --------------------------------------------------------------------------------------


def run_backup(
    *,
    runner: Runner = subprocess.run,
    environ: Mapping[str, str] | None = None,
    pause: Callable[[], None] = pause_worker,
    resume: Callable[[], None] = resume_worker,
    idle: Callable[[], None] = wait_for_idle,
    writes: Callable[[], None] = wait_for_writes,
    status_writer: Callable[[BackupStatus], None] = write_status,
    workdir: Path | None = None,
) -> BackupStatus:
    started = time.monotonic()
    steps: list[str] = []
    snapshot = ""
    size = 0
    try:
        env = restic_env(environ)
        work = workdir or Path(env.get("BACKUP_WORKDIR") or DEFAULT_WORKDIR)

        backup_window.open_window()
        steps.append("window-opened")
        try:
            with backup_window.keepalive():
                pause()
                steps.append("worker-paused")
                writes()
                steps.append("writes-drained")
                idle()
                steps.append("worker-idle")
                copy_data(work, env, runner)
                steps.append("copied")
        finally:
            try:
                resume()
                steps.append("worker-resumed")
            finally:
                backup_window.close_window()
                steps.append("window-closed")

        size = directory_size(work)
        snapshot = snapshot_and_prune(work, env, runner)
        steps.append("snapshot")
        shutil.rmtree(work, ignore_errors=True)
        status = BackupStatus(True, timezone.now().isoformat(), "پشتیبان‌گیری با موفقیت انجام شد.", snapshot, size)
    except BackupError as exc:
        logger.error("backup failed: %s", exc)
        status = BackupStatus(False, timezone.now().isoformat(), str(exc), size_bytes=size)
    except Exception as exc:
        logger.exception("backup crashed")
        status = BackupStatus(
            False, timezone.now().isoformat(), f"خطای پیش‌بینی‌نشده: {type(exc).__name__}", size_bytes=size
        )
    status.steps = steps
    status.duration_seconds = round(time.monotonic() - started, 1)
    try:
        status_writer(status)
    except Exception:
        logger.exception("could not write the backup status file")
    return status


def seconds_until(hour: int, now: datetime | None = None) -> float:
    """Seconds to the next `hour`:00 in the site's time zone (Asia/Tehran)."""
    current = timezone.localtime(now or timezone.now())
    target = current.replace(hour=hour, minute=0, second=0, microsecond=0)
    if target <= current:
        target = target + timedelta(days=1)
    return max((target - current).total_seconds(), 0.0)
