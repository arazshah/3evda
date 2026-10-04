"""Sample data and checks for the restore drill (see .github/workflows/restore-drill.yml).

`create` fills a running stack with a little of everything — an enquiry, a gallery with real photos — and
prints a manifest: how many rows each table has, a fingerprint of every stored file, a client link.
`verify` reads that manifest on stdin and fails unless everything is exactly as it was, after the data
volumes were destroyed and the backup restored.
"""

import hashlib
import json
import sys
import time
from typing import Any

from django.apps import apps as django_apps
from django.contrib.auth import get_user_model
from django.core.files.base import ContentFile
from django.core.files.uploadedfile import SimpleUploadedFile
from django.core.management.base import BaseCommand, CommandError
from django.test import Client

from apps.core import backup
from apps.core.health import s3_client

SKIPPED_APPS = {"audit"}  # login and housekeeping write here; it is not data worth comparing
PHOTO_COUNT = 2
READY_TIMEOUT_SECONDS = 120


def sample_jpeg(color: tuple[int, int, int]) -> bytes:
    import io

    from PIL import Image

    out = io.BytesIO()
    Image.new("RGB", (1200, 800), color).save(out, "JPEG", quality=85)
    return out.getvalue()


def table_counts() -> dict[str, int]:
    counts: dict[str, int] = {}
    for model in django_apps.get_models():
        if model._meta.app_label in SKIPPED_APPS or not model.__module__.startswith("apps."):
            continue
        counts[model._meta.label] = model._default_manager.count()
    return counts


def object_fingerprints() -> dict[str, str]:
    client = s3_client()
    found: dict[str, str] = {}
    for bucket in backup.buckets():
        token = None
        while True:
            kwargs: dict[str, Any] = {"Bucket": bucket}
            if token:
                kwargs["ContinuationToken"] = token
            page = client.list_objects_v2(**kwargs)
            for item in page.get("Contents", []):
                if item["Key"].startswith("_system/"):
                    continue
                body = client.get_object(Bucket=bucket, Key=item["Key"])["Body"].read()
                found[f"{bucket}/{item['Key']}"] = hashlib.sha256(body).hexdigest()
            token = page.get("NextContinuationToken")
            if not token:
                break
    return found


class Command(BaseCommand):
    help = "Restore drill helper: `create` prints a manifest, `verify` checks one read from stdin."

    def add_arguments(self, parser):  # type: ignore[no-untyped-def]
        parser.add_argument("action", choices=["create", "verify", "pause-check"])
        parser.add_argument("--admin-user", default="drill-admin")
        parser.add_argument("--admin-password", default="")

    def handle(self, *args, **options):  # type: ignore[no-untyped-def]
        if options["action"] == "create":
            self.create(options["admin_user"], options["admin_password"])
        elif options["action"] == "verify":
            self.verify()
        else:
            self.pause_check()

    def pause_check(self) -> None:
        """With the real worker and broker: a job sent while the worker is paused waits, then runs once it resumes."""
        import redis
        from django.conf import settings

        from apps.galleries.tasks import cleanup_zips

        client = redis.Redis.from_url(settings.REDIS_URL)

        def waiting() -> int:
            return int(client.llen("galleries"))

        backup.pause_worker()
        try:
            cleanup_zips.apply_async(queue="galleries")
            time.sleep(6)
            if waiting() < 1:
                raise CommandError("the job did not wait while the worker was paused")
        finally:
            backup.resume_worker()
        deadline = time.monotonic() + 60
        while waiting() > 0:
            if time.monotonic() > deadline:
                raise CommandError("the waiting job did not run after the worker resumed")
            time.sleep(2)
        self.stdout.write("OK: a job sent during the pause waited and then ran after the worker resumed")

    def create(self, admin_user: str, admin_password: str) -> None:
        from apps.galleries import links, service
        from apps.galleries.models import Gallery, GalleryPhoto
        from apps.inquiries.models import Inquiry

        if not admin_password:
            raise CommandError("--admin-password is required")
        user_model = get_user_model()
        user, _ = user_model.objects.get_or_create(
            username=admin_user, defaults={"is_staff": True, "is_superuser": True}
        )
        user.set_password(admin_password)
        user.save()

        Inquiry.objects.create(
            name="مشتری آزمایشی", phone="09120000000", message="داده‌ی تمرین بازیابی", service_key="x"
        )
        gallery = Gallery.objects.create(title="گالری تمرین بازیابی", client_name="تمرین", status="published")
        for i in range(PHOTO_COUNT):
            blob = sample_jpeg((30 + 80 * i, 120, 200))
            service.add_photo(gallery, SimpleUploadedFile(f"drill_{i}.jpg", blob, "image/jpeg"))

        deadline = time.monotonic() + READY_TIMEOUT_SECONDS
        while GalleryPhoto.objects.filter(gallery=gallery, status="ready").count() < PHOTO_COUNT:
            if time.monotonic() > deadline:
                raise CommandError("the worker did not finish the previews in time")
            time.sleep(2)

        # A photo whose previews were never made (as if the job was still in the queue when the backup ran).
        # The queue is not part of a backup, so `restore` has to re-queue it from the database.
        from apps.media.storage import private_storage

        stored = private_storage().save(
            f"galleries/{gallery.public_id.hex}/originals/pending-drill.jpg", ContentFile(sample_jpeg((200, 60, 60)))
        )
        pending = GalleryPhoto.objects.create(
            gallery=gallery,
            original_key=stored,
            original_filename="pending-drill.jpg",
            mime="image/jpeg",
            size_bytes=len(sample_jpeg((200, 60, 60))),
            sha256="0" * 64,
            width=1200,
            height=800,
            position=PHOTO_COUNT,
        )

        manifest = {
            "pending_photo": pending.pk,
            "tables": table_counts(),
            "objects": object_fingerprints(),
            "gallery_token": links.make_token(gallery),
            "gallery_title": gallery.title,
            "admin_user": admin_user,
            "admin_password": admin_password,
        }
        self.stdout.write(json.dumps(manifest, ensure_ascii=False))

    def verify(self) -> None:
        manifest = json.load(sys.stdin)
        problems: list[str] = []

        from apps.galleries.models import GalleryPhoto

        pending = GalleryPhoto.objects.filter(pk=manifest["pending_photo"]).first()
        deadline = time.monotonic() + READY_TIMEOUT_SECONDS
        while pending is not None and pending.status != "ready" and time.monotonic() < deadline:
            time.sleep(2)
            pending.refresh_from_db()
        if pending is None or pending.status != "ready":
            problems.append("the photo that was waiting for its previews was not re-queued by the restore")
        prefix = f"{backup.buckets()[0]}/galleries/"
        late = {pending.preview_key, pending.thumb_key} if pending is not None else set()

        now_tables = table_counts()
        for label, expected in manifest["tables"].items():
            if now_tables.get(label) != expected:
                problems.append(f"rows {label}: expected {expected}, found {now_tables.get(label)}")

        now_objects = object_fingerprints()
        for key, digest in manifest["objects"].items():
            if key not in now_objects:
                problems.append(f"missing file {key}")
            elif now_objects[key] != digest:
                problems.append(f"file changed {key}")
        for key in now_objects.keys() - manifest["objects"].keys():
            if key.startswith(prefix) and key[len(backup.buckets()[0]) + 1 :] in late:
                continue  # the previews the re-queued job made after the restore
            problems.append(f"unexpected file {key}")

        response = Client().get(f"/api/public/galleries/{manifest['gallery_token']}", HTTP_HOST="localhost")
        if response.status_code != 200 or response.json().get("title") != manifest["gallery_title"]:
            problems.append(f"gallery link: status {response.status_code}")

        owner = get_user_model().objects.filter(username=manifest["admin_user"]).first()
        if owner is None or not owner.check_password(manifest["admin_password"]) or not owner.is_active:
            problems.append("admin sign-in no longer works")

        if problems:
            for line in problems:
                self.stderr.write(line)
            raise CommandError(f"{len(problems)} difference(s) after restore")
        self.stdout.write(
            f"OK: {sum(manifest['tables'].values())} rows in {len(manifest['tables'])} tables, "
            f"{len(manifest['objects'])} files, gallery link and admin sign-in work"
        )
