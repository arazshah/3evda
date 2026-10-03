import threading
from datetime import time, timedelta

import pytest
from django.db import connection
from django.test import RequestFactory
from django.utils import timezone

from apps.booking import service
from apps.booking.models import Booking, BookingSettings, SessionType, WorkingHours
from apps.booking.slots import local_day

pytestmark = pytest.mark.django_db(transaction=True)


def setup():
    for weekday in range(7):
        WorkingHours.objects.create(weekday=weekday, start=time(10), end=time(18))
    BookingSettings.load()
    a = SessionType.objects.create(key="a", title_fa="الف", duration_minutes=60, buffer_minutes=0)
    b = SessionType.objects.create(key="b", title_fa="ب", duration_minutes=120, buffer_minutes=0)
    return a, b, local_day(timezone.now()) + timedelta(days=5)


def race(jobs):
    results: list[str] = []
    barrier = threading.Barrier(len(jobs))

    def run(job):
        request = RequestFactory().post("/", REMOTE_ADDR="10.0.0.1")
        request.user = type("U", (), {"is_authenticated": False})()
        try:
            barrier.wait()
            job(request)
            results.append("ok")
        except service.BookingError as error:
            results.append(error.code)
        finally:
            connection.close()

    threads = [threading.Thread(target=run, args=(job,)) for job in jobs]
    for t in threads:
        t.start()
    for t in threads:
        t.join()
    return results


def test_many_requests_for_one_slot_produce_exactly_one_booking():
    a, _, day = setup()

    def job(request):
        service.create_booking({"session_type": a, "date": day, "time": time(10), "name": "x", "phone": "1"}, request)

    results = race([job] * 8)
    assert results.count("ok") == 1 and results.count("slot_taken") == 7
    assert Booking.objects.count() == 1


def test_overlapping_slots_of_different_types_cannot_both_win():
    a, b, day = setup()

    def one(request):
        service.create_booking({"session_type": a, "date": day, "time": time(11), "name": "x", "phone": "1"}, request)

    def two(request):
        service.create_booking(
            {"session_type": b, "date": day, "time": time(10), "name": "y", "phone": "1"}, request
        )  # 10:00–12:00

    results = race([one, two] * 3)
    assert results.count("ok") == 1
    active = Booking.objects.all()
    assert active.count() == 1


def test_the_daily_limit_holds_under_a_race():
    a, _, day = setup()
    BookingSettings.objects.filter(pk=1).update(max_per_day=2)
    slots = [time(10), time(11), time(12), time(13), time(14)]

    def make(slot):
        def job(request):
            service.create_booking({"session_type": a, "date": day, "time": slot, "name": "x", "phone": "1"}, request)

        return job

    results = race([make(s) for s in slots])
    assert results.count("ok") == 2 and Booking.objects.count() == 2


def test_a_move_and_a_new_booking_cannot_collide():
    a, _, day = setup()
    request = RequestFactory().post("/")
    request.user = type("U", (), {"is_authenticated": False})()
    mine = service.create_booking(
        {"session_type": a, "date": day, "time": time(10), "name": "m", "phone": "1"}, request
    )

    def move(request):
        service.reschedule(mine.pk, day, time(14), request)

    def take(request):
        service.create_booking({"session_type": a, "date": day, "time": time(14), "name": "t", "phone": "1"}, request)

    results = race([move, take])
    assert results.count("ok") == 1 and results.count("slot_taken") == 1
    starts = sorted(b.start_at for b in Booking.objects.all())
    assert len(starts) == len(set(starts))
