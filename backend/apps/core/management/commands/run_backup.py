import logging
import os
import threading
import time
from pathlib import Path

from django.core.management.base import BaseCommand

from apps.core import backup

logger = logging.getLogger(__name__)

HEARTBEAT = Path(os.environ.get("BACKUP_HEARTBEAT", "/tmp/backup-heartbeat"))  # noqa: S108 — container-local


def heartbeat_forever(interval: float = 30.0) -> None:
    """The container's health check looks at this file. It is touched from its own thread, so a long backup
    does not look like a hang, while a dead process stops touching it."""
    while True:
        HEARTBEAT.touch()
        time.sleep(interval)


class Command(BaseCommand):
    help = "Takes a backup now (--once), or every night at BACKUP_HOUR Tehran time (default)."

    def add_arguments(self, parser):  # type: ignore[no-untyped-def]
        parser.add_argument("--once", action="store_true", help="Take one backup and exit (non-zero if it failed).")
        parser.add_argument(
            "--prepare-ssh", action="store_true", help="Write the ssh key for an sftp repository, then exit."
        )

    def handle(self, *args, **options):  # type: ignore[no-untyped-def]
        backup.prepare_ssh()
        if options["prepare_ssh"]:
            return
        if options["once"]:
            status = backup.run_backup()
            self.stdout.write(f"{'OK' if status.ok else 'FAILED'}: {status.message}")
            if not status.ok:
                raise SystemExit(1)
            return
        backup.restic_env()  # no password: refuse to start, loudly
        hour = int(os.environ.get("BACKUP_HOUR", "3"))
        logger.info("backup service started; next run at %02d:00 Tehran", hour)
        backup.recover()
        threading.Thread(target=heartbeat_forever, daemon=True).start()
        while True:
            time.sleep(backup.seconds_until(hour))
            status = backup.run_backup()
            logger.info("backup finished: ok=%s %s", status.ok, status.message)
            time.sleep(60)
