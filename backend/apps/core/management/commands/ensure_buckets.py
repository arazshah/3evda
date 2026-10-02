from botocore.exceptions import ClientError
from django.conf import settings
from django.core.management.base import BaseCommand

from apps.core.health import s3_client


def ensure_buckets() -> list[str]:
    client = s3_client()
    created = []
    for bucket in (settings.S3_PRIVATE_BUCKET, settings.S3_PUBLIC_BUCKET):
        try:
            client.head_bucket(Bucket=bucket)
        except ClientError:
            client.create_bucket(Bucket=bucket)
            created.append(bucket)
    return created


class Command(BaseCommand):
    help = "Create the private and public object-storage buckets if they do not exist."

    def handle(self, *args: object, **options: object) -> None:
        created = ensure_buckets()
        self.stdout.write(f"buckets ready (created: {', '.join(created) or 'none'})")
