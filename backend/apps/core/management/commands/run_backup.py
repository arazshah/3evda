import logging
import os
import time

from django.core.management.base import BaseCommand

from apps.core import backup

logger = logging.getLogger(__name__)


class Command(BaseCommand):
    help = "Takes a backup now (--once), or every night at BACKUP_HOUR Tehran time (default)."

    def add_arguments(self, parser):  # type: ignore[no-untyped-def]
        parser.add_argument("--once", action="store_true", help="Take one backup and exit (non-zero if it failed).")

    def handle(self, *args, **options):  # type: ignore[no-untyped-def]
        if options["once"]:
            status = backup.run_backup()
            self.stdout.write(f"{'OK' if status.ok else 'FAILED'}: {status.message}")
            if not status.ok:
                raise SystemExit(1)
            return
        backup.restic_env()  # no password: refuse to start, loudly
        hour = int(os.environ.get("BACKUP_HOUR", "3"))
        logger.info("backup service started; next run at %02d:00 Tehran", hour)
        while True:
            time.sleep(backup.seconds_until(hour))
            status = backup.run_backup()
            logger.info("backup finished: ok=%s %s", status.ok, status.message)
            time.sleep(60)
