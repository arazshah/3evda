import threading

import pytest
from django.core.files.uploadedfile import SimpleUploadedFile
from django.db import connection

from apps.galleries import service
from apps.galleries.models import Gallery, GalleryPhoto
from apps.media.tests.factories import image_bytes

pytestmark = pytest.mark.django_db(transaction=True)


def test_parallel_uploads_cannot_pass_the_photo_limit(s3_buckets, settings, monkeypatch):
    # Previews are not what is tested here, and Celery's eager mode is not thread-safe (it leaves a global flag set).
    monkeypatch.setattr("apps.galleries.tasks.process_photo.apply_async", lambda *args, **kwargs: None)
    settings.GALLERY_MAX_PHOTOS = 2
    gallery = Gallery.objects.create(title="g")
    outcomes: list[str] = []
    barrier = threading.Barrier(5)

    def one(index: int) -> None:
        upload = SimpleUploadedFile(
            f"{index}.jpg", image_bytes(color=(index * 40, 20, 90), size=(400, 300)), "image/jpeg"
        )
        try:
            barrier.wait()
            service.add_photo(gallery, upload)
            outcomes.append("ok")
        except service.GalleryError as error:
            outcomes.append(error.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=one, args=(i,)) for i in range(5)]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    assert outcomes.count("ok") == 2 and outcomes.count("too_many") == 3
    assert GalleryPhoto.objects.count() == 2
    positions = sorted(GalleryPhoto.objects.values_list("position", flat=True))
    assert positions == [0, 1]  # no two photos share a place
