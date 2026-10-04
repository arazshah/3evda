"""Sends the work the database says is unfinished back to the worker.

The job queue lives in Redis and is not part of a backup. After a restore onto a fresh server, photos and
files that were waiting for their previews, and archives that were being built, would otherwise stay
"queued" for ever. The restore script runs this once the database is back; it is safe to run at any time
(each task checks the state of its row and does nothing for work that is already done).
"""

from django.core.management.base import BaseCommand

from apps.galleries.models import GalleryPhoto, ZipJob
from apps.galleries.tasks import build_zip, process_photo
from apps.media.models import MediaAsset
from apps.media.tasks import process_asset


def requeue() -> dict[str, int]:
    assets = list(MediaAsset.objects.filter(status__in=[MediaAsset.Status.PENDING, MediaAsset.Status.PROCESSING]))
    for asset in assets:
        process_asset.apply_async(args=[str(asset.pk)])
    photos = list(GalleryPhoto.objects.filter(status=GalleryPhoto.Status.PENDING))
    for photo in photos:
        process_photo.apply_async(args=[photo.pk], queue="galleries")
    zips = list(ZipJob.objects.filter(status__in=[ZipJob.Status.QUEUED, ZipJob.Status.RUNNING]))
    for job in zips:
        build_zip.apply_async(args=[job.pk], queue="galleries")
    return {"media": len(assets), "photos": len(photos), "zips": len(zips)}


class Command(BaseCommand):
    help = "Re-queue unfinished media, photo and archive jobs from the database (after a restore)."

    def handle(self, *args, **options):  # type: ignore[no-untyped-def]
        counts = requeue()
        self.stdout.write(f"re-queued: {counts['media']} media, {counts['photos']} photos, {counts['zips']} archives")
