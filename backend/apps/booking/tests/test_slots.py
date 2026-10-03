from datetime import date, time, timedelta

import pytest

from apps.booking.slots import Busy, Rules, at, free_times, local_day, overlaps

SAT = date(2026, 10, 10)  # a Saturday
NOW = at(date(2026, 10, 1), time(8))
H = timedelta


def rules(**kw):
    base = {
        "hours": {5: [(time(10), time(13))]},
        "closed": [],
        "max_per_day": 3,
        "min_notice": H(hours=24),
        "horizon_days": 60,
    }
    return Rules(**(base | kw))


def times(day=SAT, duration=60, buffer=0, busy=(), now=NOW, **kw):
    return free_times(
        day, duration=H(minutes=duration), buffer=H(minutes=buffer), rules=rules(**kw), busy=list(busy), now=now
    )


def hm(*pairs):
    return [time(h, m) for h, m in pairs]


def test_a_plain_day_offers_every_hour():
    assert times() == hm((10, 0), (11, 0), (12, 0))


def test_buffer_widens_the_step():
    assert times(buffer=30) == hm((10, 0), (11, 30))


def test_a_slot_must_end_inside_the_interval():
    assert times(duration=90) == hm((10, 0), (11, 30))
    assert times(duration=200) == []


def test_several_intervals_and_other_weekdays():
    r = {5: [(time(9), time(10)), (time(14), time(16))]}
    assert times(hours=r) == hm((9, 0), (14, 0), (15, 0))
    assert times(day=SAT + H(days=1)) == []  # Sunday has no hours


def test_a_closed_day_has_no_slots_but_neighbours_do():
    closed = [(SAT, SAT)]
    assert times(closed=closed) == []
    assert times(day=SAT + H(days=7), closed=closed, hours={5: [(time(10), time(11))]}) == hm((10, 0))


def test_daily_limit_counts_active_bookings_on_that_local_day():
    busy = [Busy(at(SAT, time(h)), at(SAT, time(h)) + H(minutes=30)) for h in (10, 11, 12)]
    assert times(busy=busy, hours={5: [(time(9), time(21))]}) == []
    assert times(busy=busy[:2], hours={5: [(time(9), time(21))]}) != []


def test_minimum_notice_and_horizon():
    now = at(SAT, time(9))
    assert times(now=now, min_notice=H(hours=2)) == hm((11, 0), (12, 0))
    assert times(now=at(SAT - H(days=61), time(9)), horizon_days=60) == []
    assert times(now=at(SAT - H(days=60), time(9)), horizon_days=60) != []


def test_an_existing_booking_blocks_overlapping_starts_only():
    busy = [Busy(at(SAT, time(11)), at(SAT, time(12, 30)))]
    assert times(busy=busy) == hm((10, 0))  # 10:00 ends exactly when the booking starts
    assert times(busy=busy, buffer=0, duration=30) == hm((10, 0), (10, 30), (12, 30))


def test_the_buffer_of_the_new_booking_counts_too():
    busy = [Busy(at(SAT, time(11)), at(SAT, time(12)))]
    assert times(busy=busy, buffer=30) == []  # 10:00 + 60 + 30 runs into 11:00 … and 11:30 starts inside it


def test_tehran_day_boundaries():
    from datetime import UTC

    late = at(SAT, time(0, 30))
    assert late.utcoffset() == timedelta(hours=3, minutes=30)
    assert late.astimezone(UTC).date() == SAT - H(days=1)  # the same moment is still yesterday in UTC
    assert local_day(late.astimezone(UTC)) == SAT
    assert local_day(at(SAT, time(23, 59))) == SAT


def test_overlaps_is_half_open():
    a = Busy(at(SAT, time(10)), at(SAT, time(11)))
    assert not overlaps(at(SAT, time(11)), at(SAT, time(12)), [a])
    assert overlaps(at(SAT, time(10, 59)), at(SAT, time(12)), [a])


@pytest.mark.parametrize("day,weekday", [(date(2026, 10, 10), 5), (date(2026, 10, 9), 4), (date(2026, 10, 11), 6)])
def test_weekday_numbering_matches_python(day, weekday):
    assert day.weekday() == weekday
