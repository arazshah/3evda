"""Which start times are free: a pure function of plain data, so every rule is easy to test."""

from collections.abc import Iterable
from dataclasses import dataclass
from datetime import date, datetime, time, timedelta
from zoneinfo import ZoneInfo

from .models import TIMEZONE

TZ = ZoneInfo(TIMEZONE)


@dataclass(frozen=True)
class Rules:
    hours: dict[int, list[tuple[time, time]]]  # weekday → intervals
    closed: list[tuple[date, date]]
    max_per_day: int
    min_notice: timedelta
    horizon_days: int


@dataclass(frozen=True)
class Busy:
    start: datetime
    blocked_until: datetime


def local_day(moment: datetime) -> date:
    return moment.astimezone(TZ).date()


def at(day: date, clock: time) -> datetime:
    return datetime.combine(day, clock, tzinfo=TZ)


def overlaps(start: datetime, blocked_until: datetime, busy: Iterable[Busy]) -> bool:
    return any(start < b.blocked_until and b.start < blocked_until for b in busy)


def free_times(
    day: date,
    *,
    duration: timedelta,
    buffer: timedelta,
    rules: Rules,
    busy: list[Busy],
    now: datetime,
) -> list[time]:
    """Start times (Tehran) the public can book on `day`."""
    today = local_day(now)
    if day > today + timedelta(days=rules.horizon_days):
        return []
    if any(start <= day <= end for start, end in rules.closed):
        return []
    if sum(1 for b in busy if local_day(b.start) == day) >= rules.max_per_day:
        return []
    earliest = now + rules.min_notice
    step = duration + buffer
    found: list[time] = []
    for start, end in rules.hours.get(day.weekday(), []):
        cursor = at(day, start)
        limit = at(day, end)
        while cursor + duration <= limit:
            if cursor >= earliest and not overlaps(cursor, cursor + step, busy):
                found.append(cursor.timetz().replace(tzinfo=None))
            cursor += step
    return found
