"""Changing DJANGO_SECRET_KEY must not cancel the links already handed out (nor open new holes)."""

from datetime import timedelta

import pytest
from django.utils import timezone

from apps.booking.links import find_by_token as find_booking
from apps.booking.links import make_token as booking_token
from apps.booking.models import Booking, SessionType
from apps.galleries import access
from apps.galleries.links import find_by_token as find_gallery
from apps.galleries.links import make_token as gallery_token
from apps.galleries.models import Gallery
from apps.proformas.links import find_by_token as find_proforma
from apps.proformas.links import make_token as proforma_token
from apps.proformas.models import Proforma

pytestmark = pytest.mark.django_db

OLD = "old-key-" + "o" * 60
NEW = "new-key-" + "n" * 60


def rotate(settings, *, keep_old: bool):
    settings.SECRET_KEY = NEW
    settings.SECRET_KEY_FALLBACKS = [OLD] if keep_old else []


@pytest.fixture
def made_under_the_old_key(settings):
    settings.SECRET_KEY = OLD
    settings.SECRET_KEY_FALLBACKS = []
    gallery = Gallery.objects.create(title="g", status="published")
    proforma = Proforma.objects.create(status="sent", customer_name="مشتری")
    kind = SessionType.objects.create(key="studio", title_fa="استودیو", duration_minutes=60)
    start = timezone.now() + timedelta(days=3)
    booking = Booking.objects.create(
        session_type=kind,
        session_label="استودیو",
        start_at=start,
        end_at=start + timedelta(hours=1),
        blocked_until=start + timedelta(hours=1),
        name="n",
        phone="0912",
    )
    return {
        "gallery": (gallery, gallery_token(gallery)),
        "proforma": (proforma, proforma_token(proforma)),
        "booking": (booking, booking_token(booking)),
        "access": (gallery, access.make_access_token(gallery)),
    }


def test_links_given_before_the_change_still_work_while_the_old_key_is_a_fallback(settings, made_under_the_old_key):
    rotate(settings, keep_old=True)
    for name, finder in (("gallery", find_gallery), ("proforma", find_proforma), ("booking", find_booking)):
        row, token = made_under_the_old_key[name]
        assert finder(token) == row, name
    gallery, token = made_under_the_old_key["access"]
    assert access.check_access_token(gallery, token)


def test_without_the_fallback_they_stop_working_as_before(settings, made_under_the_old_key):
    rotate(settings, keep_old=False)
    for name, finder in (("gallery", find_gallery), ("proforma", find_proforma), ("booking", find_booking)):
        assert finder(made_under_the_old_key[name][1]) is None, name
    gallery, token = made_under_the_old_key["access"]
    assert not access.check_access_token(gallery, token)


def test_new_links_are_made_with_the_new_key_only(settings, made_under_the_old_key):
    rotate(settings, keep_old=True)
    gallery, old_token = made_under_the_old_key["gallery"]
    fresh = gallery_token(gallery)
    assert fresh != old_token  # signed with the current key, not the fallback
    settings.SECRET_KEY_FALLBACKS = []  # once the old key is dropped, the new link still works
    assert find_gallery(fresh) == gallery
    assert find_gallery(old_token) is None


def test_a_signature_from_some_other_key_is_refused(settings, made_under_the_old_key):
    rotate(settings, keep_old=True)
    settings.SECRET_KEY_FALLBACKS = ["a-third-key-" + "x" * 60]
    assert find_gallery(made_under_the_old_key["gallery"][1]) is None


def test_other_ways_of_forging_a_link_still_fail_with_fallbacks_on(settings, made_under_the_old_key):
    rotate(settings, keep_old=True)
    _, token = made_under_the_old_key["gallery"]
    public, _, signature = token.partition("_")
    for bad in (
        f"{public}_",
        f"{public}_{signature[:-2]}ab",
        f"{'0' * 32}_{signature}",
        public,
        f"{public}.{signature}",
    ):
        assert find_gallery(bad) is None, bad


def test_the_fallbacks_come_from_the_environment_as_a_list(monkeypatch):
    import environ

    env = environ.Env()
    monkeypatch.setenv("DJANGO_SECRET_KEY_FALLBACKS", "a,b")
    assert env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[]) == ["a", "b"]
    monkeypatch.delenv("DJANGO_SECRET_KEY_FALLBACKS")
    assert env.list("DJANGO_SECRET_KEY_FALLBACKS", default=[]) == []
