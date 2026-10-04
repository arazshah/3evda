from datetime import date, time, timedelta

import pytest
from django.utils import timezone
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.booking import service
from apps.booking.links import find_by_token, make_token
from apps.booking.models import Booking, BookingSettings, ClosedPeriod, SessionType, WorkingHours
from apps.booking.slots import at, local_day
from apps.inquiries.models import Inquiry

pytestmark = pytest.mark.django_db

PUBLIC = "/api/public/"
ADMIN = "/api/admin/bookings/"
SETUP = "/api/admin/booking/"


@pytest.fixture(autouse=True)
def _roomy_rate_limit(monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    rates = {
        **ScopedRateThrottle.THROTTLE_RATES,
        "booking": "1000/min",
        "booking_read": "1000/min",
        "estimate": "1000/min",
    }
    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", rates)


@pytest.fixture
def week(db):
    """Every day 10:00–18:00, one 60-minute type with a 30-minute buffer, one inactive type."""
    for weekday in range(7):
        WorkingHours.objects.create(weekday=weekday, start=time(10), end=time(18))
    BookingSettings.objects.update_or_create(
        pk=1, defaults={"max_per_day": 3, "min_notice_hours": 24, "horizon_days": 60}
    )
    studio = SessionType.objects.create(
        key="studio", title_fa="استودیو", title_en="Studio", duration_minutes=60, buffer_minutes=30
    )
    SessionType.objects.create(key="old", title_fa="قدیمی", duration_minutes=60, is_active=False)
    return studio


def day(n: int = 5) -> date:
    return local_day(timezone.now()) + timedelta(days=n)


def book(client, when=None, hhmm="10:00", **extra):
    body = {
        "type": "studio",
        "date": (when or day()).isoformat(),
        "time": hhmm,
        "name": "سارا",
        "phone": "09120000000",
    } | extra
    return client.post(f"{PUBLIC}bookings", body, format="json")


def token_of(response) -> str:
    return response.data["link"].rsplit("/b/", 1)[1]


def admin_booking(week, hhmm="10:00", n=5, status="pending", **kw):
    request = type("R", (), {"user": None, "META": {}})()
    return service.create_booking(
        {
            "session_type": week,
            "date": day(n),
            "time": time.fromisoformat(hhmm),
            "name": "x",
            "phone": "1",
            "status": status,
        }
        | kw,
        request,
        admin=True,
    )


# ---- public: options and availability -------------------------------------------------------------


def test_options_list_only_active_types_without_internals(week):
    r = APIClient().get(f"{PUBLIC}booking/options")
    assert r.status_code == 200
    assert [t["key"] for t in r.data["session_types"]] == ["studio"]
    assert set(r.data["session_types"][0]) == {"key", "title_fa", "title_en", "duration_minutes"}


def test_availability_lists_days_with_times(week):
    r = APIClient().get(
        f"{PUBLIC}booking/availability",
        {"type": "studio", "from": day().isoformat(), "to": (day() + timedelta(days=1)).isoformat()},
    )
    assert r.status_code == 200 and r["Cache-Control"] == "no-store"
    assert [d["date"] for d in r.data["days"]] == [day().isoformat(), (day() + timedelta(days=1)).isoformat()]
    assert r.data["days"][0]["times"][:2] == ["10:00", "11:30"]


def test_availability_rejects_bad_input(week):
    c = APIClient()
    assert (
        c.get(
            f"{PUBLIC}booking/availability", {"type": "nope", "from": day().isoformat(), "to": day().isoformat()}
        ).status_code
        == 400
    )
    assert (
        c.get(
            f"{PUBLIC}booking/availability", {"type": "old", "from": day().isoformat(), "to": day().isoformat()}
        ).status_code
        == 400
    )
    assert c.get(f"{PUBLIC}booking/availability", {"type": "studio", "from": "bad", "to": "bad"}).status_code == 400
    r = c.get(
        f"{PUBLIC}booking/availability",
        {"type": "studio", "from": day().isoformat(), "to": (day() + timedelta(days=70)).isoformat()},
    )
    assert r.status_code == 400 and r.data["code"] == "range_too_long"
    r = c.get(f"{PUBLIC}booking/availability", {"type": "studio", "from": day(3).isoformat(), "to": day(2).isoformat()})
    assert r.status_code == 400


def test_closed_days_and_a_full_day_disappear(week):
    ClosedPeriod.objects.create(start_date=day(6), end_date=day(7), reason="سفر")
    for hhmm in ("10:00", "11:30", "13:00"):
        assert book(APIClient(), day(5), hhmm).status_code == 201
    r = APIClient().get(
        f"{PUBLIC}booking/availability", {"type": "studio", "from": day(5).isoformat(), "to": day(8).isoformat()}
    )
    assert [d["date"] for d in r.data["days"]] == [day(8).isoformat()]  # day 5 is full, 6 and 7 closed


# ---- public: booking -------------------------------------------------------------------------------


def test_booking_is_pending_and_takes_the_slot(week):
    r = book(APIClient())
    assert r.status_code == 201 and r["Cache-Control"] == "no-store"
    assert r.data["status"] == "pending" and r.data["time"] == "10:00" and r.data["end_time"] == "11:00"
    assert "/b/" in r.data["link"] and "." not in r.data["link"].rsplit("/b/", 1)[1]
    free = APIClient().get(
        f"{PUBLIC}booking/availability", {"type": "studio", "from": day().isoformat(), "to": day().isoformat()}
    )
    assert (
        "10:00" not in free.data["days"][0]["times"] and "11:00" not in free.data["days"][0]["times"]
    )  # 11:00 is inside the buffer
    booking = Booking.objects.get()
    assert booking.ip_hash == "" or len(booking.ip_hash) == 64
    assert booking.session_label == "استودیو" and not booking.created_by_admin


def test_the_same_slot_twice_is_refused_in_the_customers_language(week):
    assert book(APIClient()).status_code == 201
    r = book(APIClient(), language="en")
    assert r.status_code == 409 and r.data["code"] == "slot_taken" and "no longer available" in r.data["detail"]
    r = book(APIClient())
    assert "آزاد نیست" in r.data["detail"]
    assert Booking.objects.count() == 1


def test_overlap_with_the_buffer_is_refused(week):
    assert book(APIClient(), hhmm="10:00").status_code == 201
    assert book(APIClient(), hhmm="11:00").status_code == 409  # inside the first booking's buffer
    assert book(APIClient(), hhmm="11:30").status_code == 201


def test_times_the_engine_does_not_offer_are_refused(week):
    for hhmm in ("09:00", "10:15", "17:30", "23:00"):
        assert book(APIClient(), hhmm=hhmm).status_code == 409, hhmm
    assert book(APIClient(), when=day(0), hhmm="12:00").status_code == 409  # inside the minimum notice
    assert book(APIClient(), when=day(90)).status_code == 409  # beyond the horizon


def test_validation(week):
    c = APIClient()
    assert (
        c.post(
            f"{PUBLIC}bookings",
            {"type": "studio", "date": day().isoformat(), "time": "10:00", "name": "x"},
            format="json",
        ).status_code
        == 400
    )
    r = c.post(
        f"{PUBLIC}bookings",
        {"type": "studio", "date": day().isoformat(), "time": "10:00", "name": "x", "language": "en"},
        format="json",
    )
    assert r.status_code == 400 and "at least one way" in str(r.data)
    assert book(c, type="old").status_code == 400
    assert book(c, type="nope").status_code == 400
    assert book(c, phone="abc").status_code == 400
    assert book(c, time="25:00").status_code == 400
    assert book(c, package=999999).status_code == 400
    assert Booking.objects.count() == 0


def test_persian_digits_in_the_phone_are_stored_as_ascii(week):
    assert book(APIClient(), phone="۰۹۱۲۰۰۰۰۰۰۰").status_code == 201
    assert Booking.objects.get().phone == "09120000000"


def test_honeypot_stores_nothing(week):
    r = book(APIClient(), website="http://spam")
    assert r.status_code == 201 and Booking.objects.count() == 0


def test_package_is_linked_and_labelled(week):
    from apps.pricing.models import Package, PackageGroup

    group = PackageGroup.objects.create(title_fa="گ")
    pkg = Package.objects.create(group=group, title_fa="بسته‌ی یک", title_en="Package one", is_published=True)
    assert book(APIClient(), package=pkg.pk, language="en").status_code == 201
    b = Booking.objects.get()
    assert b.package == pkg and b.package_label == "Package one" and b.session_label == "Studio"


def test_rate_limit(week, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "booking": "2/min"})
    c = APIClient()
    codes = [book(c, hhmm=h).status_code for h in ("10:00", "11:30", "13:00")]
    assert codes == [201, 201, 429]


# ---- the customer's link ---------------------------------------------------------------------------


def test_the_link_shows_status_without_changing_anything(week):
    r = book(APIClient())
    t = token_of(r)
    g = APIClient().get(f"{PUBLIC}bookings/{t}")
    assert g.status_code == 200 and g["Cache-Control"] == "no-store"
    assert g.data["status"] == "pending" and g.data["can_cancel"] is True
    assert not {"id", "phone", "internal_note", "ip_hash", "notes"} & set(g.data)


def test_forged_and_foreign_tokens_are_404(week):
    b = Booking.objects.get(pk=book(APIClient()).data and Booking.objects.get().pk)
    pub, sig = make_token(b).split("_", 1)
    for bad in ["nope", f"{pub}_{sig[:-2]}ab", f"{'0' * 32}_{sig}", f"{pub}.{sig}", pub]:
        assert APIClient().get(f"{PUBLIC}bookings/{bad}").status_code == 404, bad
        assert APIClient().post(f"{PUBLIC}bookings/{bad}/cancel").status_code == 404
    assert find_by_token(make_token(b)) == b


def test_customer_cancel_frees_the_slot_and_is_idempotent(week):
    t = token_of(book(APIClient()))
    c = APIClient()
    r = c.post(f"{PUBLIC}bookings/{t}/cancel")
    assert r.status_code == 200 and r.data["status"] == "cancelled" and r.data["cancelled_by"] == "customer"
    assert c.post(f"{PUBLIC}bookings/{t}/cancel").status_code == 200
    assert book(APIClient()).status_code == 201  # the slot is free again
    assert AuditLog.objects.filter(action="booking.booking.customer_cancel").count() == 1


def test_customer_cannot_cancel_after_the_start_or_after_the_owner_cancelled(week):
    b = admin_booking(week, status="confirmed")
    Booking.objects.filter(pk=b.pk).update(
        start_at=timezone.now() - timedelta(hours=2),
        end_at=timezone.now() - timedelta(hours=1),
        blocked_until=timezone.now(),
    )
    r = APIClient().post(f"{PUBLIC}bookings/{make_token(b)}/cancel")
    assert r.status_code == 409 and r.data["code"] == "too_late"
    other = admin_booking(week, "13:00", status="confirmed")
    service.cancel(other.pk, type("R", (), {"user": None, "META": {}})())
    r = APIClient().post(f"{PUBLIC}bookings/{make_token(other)}/cancel")
    assert (
        r.status_code == 200 and r.data["status"] == "cancelled" and r.data["cancelled_by"] == "admin"
    )  # it already is
    done = admin_booking(week, "15:00", status="confirmed")
    Booking.objects.filter(pk=done.pk).update(status="completed")
    r = APIClient().post(f"{PUBLIC}bookings/{make_token(done)}/cancel")
    assert r.status_code == 409 and r.data["code"] == "not_cancellable"


# ---- the owner -------------------------------------------------------------------------------------


def test_admin_endpoints_refuse_anonymous():
    c = APIClient()
    for url in (
        ADMIN,
        f"{ADMIN}summary/",
        f"{SETUP}hours/",
        f"{SETUP}settings/",
        f"{SETUP}session-types/",
        f"{SETUP}closed/",
    ):
        assert c.get(url).status_code in (401, 403), url


def test_owner_creates_outside_the_hours_but_never_over_another_booking(owner_client, week):
    r = owner_client.post(
        ADMIN,
        {"session_type": week.pk, "date": day(0).isoformat(), "time": "07:00", "name": "تلفنی", "phone": "1"},
        format="json",
    )
    assert r.status_code == 201 and r.data["status"] == "confirmed" and r.data["created_by_admin"] is True
    clash = owner_client.post(
        ADMIN,
        {"session_type": week.pk, "date": day(0).isoformat(), "time": "07:30", "name": "دوم", "phone": "1"},
        format="json",
    )
    assert clash.status_code == 409 and clash.data["code"] == "slot_taken"


def test_confirm_complete_and_cancel(owner_client, week):
    b = admin_booking(week)
    r = owner_client.post(f"{ADMIN}{b.pk}/confirm/")
    assert r.status_code == 200 and r.data["status"] == "confirmed"
    assert owner_client.post(f"{ADMIN}{b.pk}/confirm/").status_code == 200  # again: nothing changes
    assert owner_client.post(f"{ADMIN}{b.pk}/complete/").data["code"] == "not_started"
    Booking.objects.filter(pk=b.pk).update(
        start_at=timezone.now() - timedelta(hours=3),
        end_at=timezone.now() - timedelta(hours=2),
        blocked_until=timezone.now() - timedelta(hours=1),
    )
    assert owner_client.post(f"{ADMIN}{b.pk}/complete/").data["status"] == "completed"
    assert owner_client.post(f"{ADMIN}{b.pk}/cancel/").status_code == 409  # completed cannot be cancelled
    c = admin_booking(week, "13:00")
    r = owner_client.post(f"{ADMIN}{c.pk}/cancel/", {"reason": "پر است"}, format="json")
    assert r.data["status"] == "cancelled" and r.data["cancelled_by"] == "admin" and r.data["cancel_reason"] == "پر است"
    assert owner_client.post(f"{ADMIN}{c.pk}/cancel/").status_code == 200
    assert owner_client.post(f"{ADMIN}{c.pk}/confirm/").status_code == 409  # cancelled stays cancelled


def test_confirming_a_booking_in_the_past_is_refused(owner_client, week):
    b = admin_booking(week)
    Booking.objects.filter(pk=b.pk).update(
        start_at=timezone.now() - timedelta(hours=3),
        end_at=timezone.now() - timedelta(hours=2),
        blocked_until=timezone.now() - timedelta(hours=2),
    )
    r = owner_client.post(f"{ADMIN}{b.pk}/confirm/")
    assert r.status_code == 409 and r.data["code"] == "in_past"


def test_confirming_converts_the_linked_inquiry_once(owner_client, week):
    inquiry = Inquiry.objects.create(name="ا", phone="1")
    b = admin_booking(week, inquiry=inquiry)
    owner_client.post(f"{ADMIN}{b.pk}/confirm/")
    inquiry.refresh_from_db()
    assert inquiry.status == "converted" and inquiry.history.count() == 1
    owner_client.post(f"{ADMIN}{b.pk}/confirm/")
    assert inquiry.history.count() == 1


def test_reschedule_ignores_itself_and_refuses_overlap(owner_client, week):
    a = admin_booking(week, "10:00")
    b = admin_booking(week, "13:00")
    r = owner_client.post(f"{ADMIN}{a.pk}/reschedule/", {"date": day().isoformat(), "time": "10:30"}, format="json")
    assert r.status_code == 200 and r.data["time"] == "10:30" and r.data["end_time"] == "11:30"
    r = owner_client.post(f"{ADMIN}{a.pk}/reschedule/", {"date": day().isoformat(), "time": "12:30"}, format="json")
    assert r.status_code == 409  # runs into the 13:00 booking (with its buffer)
    service.cancel(b.pk, type("R", (), {"user": None, "META": {}})())
    assert (
        owner_client.post(
            f"{ADMIN}{b.pk}/reschedule/", {"date": day().isoformat(), "time": "15:00"}, format="json"
        ).status_code
        == 409
    )  # cancelled


def test_list_filters_search_and_summary(owner_client, week):
    a = admin_booking(week, "10:00", n=5, name="رضا")
    admin_booking(week, "10:00", n=8, name="مریم", status="confirmed")
    assert owner_client.get(ADMIN).data["count"] == 2
    assert owner_client.get(ADMIN, {"status": "pending"}).data["count"] == 1
    assert owner_client.get(ADMIN, {"q": "مریم"}).data["count"] == 1
    r = owner_client.get(ADMIN, {"from": day(5).isoformat(), "to": day(5).isoformat()})
    assert [x["id"] for x in r.data["results"]] == [a.pk]
    assert owner_client.get(ADMIN, {"from": "x"}).status_code == 400
    assert owner_client.get(f"{ADMIN}summary/").data == {"pending": 1}


def test_opening_marks_it_seen_and_notes_can_be_saved(owner_client, week):
    b = admin_booking(week)
    Booking.objects.filter(pk=b.pk).update(seen_at=None)
    assert owner_client.get(ADMIN).data["results"][0]["is_new"] is True
    d = owner_client.get(f"{ADMIN}{b.pk}/").data
    assert d["link"].startswith("http") and d["is_new"] is False  # opening it is what marks it seen
    assert owner_client.get(ADMIN).data["results"][0]["is_new"] is False
    r = owner_client.patch(
        f"{ADMIN}{b.pk}/", {"internal_note": "یادداشت", "status": "completed", "name": "hack"}, format="json"
    )
    assert (
        r.status_code == 200
        and r.data["internal_note"] == "یادداشت"
        and r.data["status"] == "pending"
        and r.data["name"] == "x"
    )


def test_settings_hours_closed_periods_and_types(owner_client, week):
    assert owner_client.patch(f"{SETUP}settings/", {"max_per_day": 5}, format="json").data["max_per_day"] == 5
    assert owner_client.patch(f"{SETUP}settings/", {"max_per_day": 0}, format="json").status_code == 400
    ok = {"hours": [{"weekday": 5, "start": "09:00", "end": "12:00"}, {"weekday": 5, "start": "14:00", "end": "17:00"}]}
    assert owner_client.put(f"{SETUP}hours/", ok, format="json").status_code == 200
    assert (
        WorkingHours.objects.count() == 2 and owner_client.get(f"{SETUP}hours/").data["hours"][0]["start"] == "09:00:00"
    )
    for bad in (
        {"hours": [{"weekday": 5, "start": "09:00", "end": "12:00"}, {"weekday": 5, "start": "11:00", "end": "13:00"}]},
        {"hours": [{"weekday": 5, "start": "12:00", "end": "09:00"}]},
        {"hours": [{"weekday": 9, "start": "09:00", "end": "12:00"}]},
    ):
        assert owner_client.put(f"{SETUP}hours/", bad, format="json").status_code == 400
    assert WorkingHours.objects.count() == 2  # a refused change leaves the week as it was
    r = owner_client.post(f"{SETUP}closed/", {"start_date": "2026-12-01", "end_date": "2026-11-30"}, format="json")
    assert r.status_code == 400
    r = owner_client.post(
        f"{SETUP}closed/", {"start_date": "2026-12-01", "end_date": "2026-12-03", "reason": "سفر"}, format="json"
    )
    assert r.status_code == 201 and owner_client.delete(f"{SETUP}closed/{r.data['id']}/").status_code == 204
    t = owner_client.post(
        f"{SETUP}session-types/", {"key": "new-one", "title_fa": "ن", "duration_minutes": 45}, format="json"
    )
    assert (
        t.status_code == 201
        and owner_client.post(
            f"{SETUP}session-types/", {"key": "bad key", "title_fa": "ن", "duration_minutes": 45}, format="json"
        ).status_code
        == 400
    )
    assert (
        owner_client.post(
            f"{SETUP}session-types/", {"key": "tiny", "title_fa": "ن", "duration_minutes": 5}, format="json"
        ).status_code
        == 400
    )


def test_a_session_type_with_bookings_cannot_be_deleted(owner_client, week):
    admin_booking(week)
    r = owner_client.delete(f"{SETUP}session-types/{week.pk}/")
    assert r.status_code == 409 and Booking.objects.count() == 1
    ids = list(SessionType.objects.values_list("pk", flat=True))
    assert owner_client.post(f"{SETUP}session-types/reorder/", {"ids": ids[::-1]}, format="json").status_code == 204


def test_changing_a_types_length_does_not_move_existing_bookings(owner_client, week):
    b = admin_booking(week)
    owner_client.patch(f"{SETUP}session-types/{week.pk}/", {"duration_minutes": 120}, format="json")
    b.refresh_from_db()
    assert b.end_at - b.start_at == timedelta(minutes=60)


def test_seed_command_is_idempotent(db):
    from django.core.management import call_command

    call_command("seed_booking_demo")
    call_command("seed_booking_demo")
    assert SessionType.objects.count() == 3 and WorkingHours.objects.count() == 6
    assert at(day(), time(10)).weekday() == day().weekday()
