"""What the panel's "system status" card shows, gathered in one place.

Every check returns a level — `ok`, `warning`, `error` or `unknown` (we could not tell, which is not an
alarm) — and a short Persian sentence. Nothing here includes a secret or a personal detail.
"""

import json
import logging
import urllib.request
from collections.abc import Callable
from dataclasses import dataclass
from datetime import datetime, timedelta
from typing import Any

from django.conf import settings
from django.db.models import Sum
from django.utils import timezone

from . import backup, health

logger = logging.getLogger(__name__)

RANK = {"ok": 0, "unknown": 0, "warning": 1, "error": 2}
BACKUP_STALE_AFTER = timedelta(hours=26)
QUEUE_WARNING_AFTER = timedelta(minutes=15)
QUEUE_ERROR_AFTER = timedelta(hours=1)
DISK_WARNING_BELOW = 20.0
DISK_ERROR_BELOW = 10.0
STORAGE_STATUS_URL = "http://storage:8080/status"  # the volume server's own report, on the internal network


@dataclass
class Check:
    key: str
    label: str
    level: str
    detail: str


def _attempt(key: str, label: str, probe: Callable[[], None], ok_detail: str, bad_detail: str) -> Check:
    try:
        probe()
    except Exception:
        logger.warning("status check failed", extra={"check": key}, exc_info=True)
        return Check(key, label, "error", bad_detail)
    return Check(key, label, "ok", ok_detail)


def check_worker() -> Check:
    try:
        from config.celery import app

        replies = app.control.ping(timeout=1.0)
    except Exception:
        replies = []
    if replies:
        return Check("worker", "پردازشگر پس‌زمینه", "ok", "فعال است.")
    return Check("worker", "پردازشگر پس‌زمینه", "error", "پاسخ نمی‌دهد؛ پردازش عکس‌ها و ساخت فایل ZIP متوقف است.")


def oldest_waiting(now: datetime | None = None) -> timedelta | None:
    """How long the longest-waiting unfinished job has been waiting, from what the database says is pending."""
    from apps.galleries.models import GalleryPhoto, ZipJob
    from apps.media.models import MediaAsset

    now = now or timezone.now()
    times = []
    for qs in (
        MediaAsset.objects.filter(status=MediaAsset.Status.PENDING),
        GalleryPhoto.objects.filter(status=GalleryPhoto.Status.PENDING),
        ZipJob.objects.filter(status=ZipJob.Status.QUEUED),
    ):
        first = qs.order_by("created_at").values_list("created_at", flat=True).first()
        if first is not None:
            times.append(first)
    return now - min(times) if times else None


def check_queue(now: datetime | None = None) -> Check:
    waiting = oldest_waiting(now)
    label = "صف کارها"
    if waiting is None:
        return Check("queue", label, "ok", "کاری در انتظار نیست.")
    minutes = int(waiting.total_seconds() // 60)
    level = "error" if waiting >= QUEUE_ERROR_AFTER else "warning" if waiting >= QUEUE_WARNING_AFTER else "ok"
    return Check("queue", label, level, f"قدیمی‌ترین کار {minutes} دقیقه است که منتظر مانده.")


def _ago(then: datetime, now: datetime) -> str:
    hours = (now - then).total_seconds() / 3600
    if hours < 1:
        return "کمتر از یک ساعت پیش"
    if hours < 48:
        return f"{int(hours)} ساعت پیش"
    return f"{int(hours // 24)} روز پیش"


def _parse(value: Any) -> datetime | None:
    try:
        parsed = datetime.fromisoformat(str(value))
    except ValueError:
        return None
    return parsed if parsed.tzinfo else timezone.make_aware(parsed)


def check_backup(status: dict[str, Any] | None, now: datetime | None = None) -> Check:
    now = now or timezone.now()
    label = "آخرین پشتیبان"
    if not status:
        return Check(
            "backup", label, "warning", "هنوز پشتیبانی گرفته نشده است (نخستین نسخه ساعت ۰۳:۰۰ شب ساخته می‌شود)."
        )
    last_ok = _parse(status.get("last_ok_at"))
    if status.get("ok") is False:
        when = f"آخرین نسخه‌ی سالم {_ago(last_ok, now)} بود" if last_ok else "هنوز نسخه‌ی سالمی وجود ندارد"
        return Check("backup", label, "error", f"آخرین اجرا ناموفق بود: {status.get('message', '')} ({when}).")
    if last_ok is None:
        return Check("backup", label, "warning", "زمان آخرین نسخه‌ی سالم مشخص نیست.")
    if now - last_ok > BACKUP_STALE_AFTER:
        return Check(
            "backup", label, "error", f"آخرین پشتیبان سالم {_ago(last_ok, now)} گرفته شده است؛ بیش از ۲۶ ساعت."
        )
    return Check("backup", label, "ok", f"آخرین پشتیبان سالم {_ago(last_ok, now)} گرفته شد.")


def _disk_level(free: float) -> str:
    return "error" if free < DISK_ERROR_BELOW else "warning" if free < DISK_WARNING_BELOW else "ok"


def check_backup_disk(status: dict[str, Any] | None) -> Check:
    label = "فضای آزاد پشتیبان‌ها"
    free = (status or {}).get("disk_free_percent")
    if not isinstance(free, int | float):
        return Check("backup_disk", label, "unknown", "پس از نخستین پشتیبان نمایش داده می‌شود.")
    return Check("backup_disk", label, _disk_level(float(free)), f"{free:.0f}% آزاد است.")


def storage_free_percent(fetch: Callable[[], dict[str, Any]] | None = None) -> float | None:
    def default() -> dict[str, Any]:
        with urllib.request.urlopen(STORAGE_STATUS_URL, timeout=2) as response:
            return json.load(response)  # type: ignore[no-any-return]

    try:
        body = (fetch or default)()
        disks = body["DiskStatuses"]
        worst = min(float(d["percent_free"]) for d in disks)
    except Exception:
        return None
    return worst


def check_storage_disk(fetch: Callable[[], dict[str, Any]] | None = None) -> Check:
    label = "فضای آزاد ذخیره‌سازی"
    free = storage_free_percent(fetch)
    if free is None:
        return Check("storage_disk", label, "unknown", "اندازه‌گیری نشد.")
    return Check("storage_disk", label, _disk_level(free), f"{free:.0f}% آزاد است.")


def gallery_usage() -> tuple[int, int]:
    from apps.galleries.models import FinalFile, Gallery, GalleryPhoto

    photos = GalleryPhoto.objects.aggregate(a=Sum("size_bytes"), b=Sum("stored_bytes"))
    finals = FinalFile.objects.aggregate(a=Sum("size_bytes"))
    total = int(photos["a"] or 0) + int(photos["b"] or 0) + int(finals["a"] or 0)
    return Gallery.objects.count(), total


def check_galleries() -> Check:
    count, total = gallery_usage()
    gigabytes = total / (1024**3)
    size = f"{gigabytes:.1f} گیگابایت" if gigabytes >= 1 else f"{total / (1024**2):.0f} مگابایت"
    return Check("galleries", "فضای گالری‌ها", "ok", f"{count} گالری، {size}.")


def collect(*, backup_status: dict[str, Any] | None = None, now: datetime | None = None) -> dict[str, Any]:
    now = now or timezone.now()
    saved = backup_status if backup_status is not None else backup.read_status()
    checks = [
        _attempt("database", "پایگاه‌داده", health.check_database, "پاسخ می‌دهد.", "در دسترس نیست."),
        _attempt("redis", "Redis (صف و حافظه‌ی کمکی)", health.check_redis, "پاسخ می‌دهد.", "در دسترس نیست."),
        _attempt("storage", "ذخیره‌سازی فایل", health.check_storage, "پاسخ می‌دهد.", "در دسترس نیست."),
        check_worker(),
        check_queue(now),
        check_backup(saved, now),
        check_backup_disk(saved),
        check_storage_disk(),
        check_galleries(),
    ]
    level = max((c.level for c in checks), key=lambda x: RANK[x])
    return {
        "level": "ok" if RANK[level] == 0 else level,
        "checked_at": now.isoformat(),
        "version": settings.APP_VERSION,
        "checks": [c.__dict__ for c in checks],
    }
