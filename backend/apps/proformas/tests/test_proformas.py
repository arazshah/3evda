import io
from datetime import timedelta
from decimal import Decimal

import pytest
from django.utils import timezone
from pypdf import PdfReader
from rest_framework.test import APIClient

from apps.audit.models import AuditLog
from apps.inquiries.models import Inquiry
from apps.proformas import service
from apps.proformas.links import find_by_token, make_token
from apps.proformas.models import Proforma, ProformaItem
from apps.proformas.pdf import SafeFetcher, date_text, number_text, render_pdf
from apps.proformas.totals import compute_totals

pytestmark = pytest.mark.django_db

ADMIN = "/api/admin/proformas/"
PUBLIC = "/api/public/proformas/"


@pytest.fixture(autouse=True)
def _roomy_rate_limit(monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "proforma": "1000/min"}
    )


def body(**extra):
    day = (timezone.localdate() + timedelta(days=10)).isoformat()
    return {
        "customer_name": "علی",
        "valid_until": day,
        "items": [{"description": "عکاسی غذا", "quantity": 2, "unit_price": 1_000_000}],
        **extra,
    }


def draft(client, **extra):
    response = client.post(ADMIN, body(**extra), format="json")
    assert response.status_code == 201, response.data
    return response.data


def issued(client, **extra):
    made = draft(client, **extra)
    response = client.post(f"{ADMIN}{made['id']}/issue/")
    assert response.status_code == 200, response.data
    return response.data


def token_of(data):
    return data["link"].rsplit("/p/", 1)[1]


# ---- arithmetic ------------------------------------------------------------------------------------


def test_totals_order_and_rounding():
    t = compute_totals([(3, 333)], discount_percent=Decimal("10"), tax_percent=Decimal("9"))
    assert (t.subtotal, t.discount, t.taxable, t.tax, t.total) == (999, 100, 899, 81, 980)


def test_discount_amount_is_capped_at_subtotal():
    t = compute_totals([(1, 100)], discount_amount=500)
    assert (t.discount, t.total) == (0 + 100, 0)


def test_no_items_is_zero():
    assert compute_totals([]).total == 0


# ---- drafts ----------------------------------------------------------------------------------------


def test_create_calculates_totals_and_takes_defaults(owner_client):
    from apps.proformas.models import ProformaSettings

    s = ProformaSettings.load()
    s.terms_fa, s.default_tax_percent = "شرایط ما", Decimal("9")
    s.save()
    data = draft(owner_client)
    assert data["subtotal"] == 2_000_000
    assert data["tax_percent"] == "9.00" and data["tax"] == 180_000 and data["total"] == 2_180_000
    assert data["terms"] == "شرایط ما"
    assert data["status"] == "draft" and data["number"] is None and data["link"] is None


def test_both_kinds_of_discount_refused(owner_client):
    r = owner_client.post(ADMIN, body(discount_amount=10, discount_percent="5"), format="json")
    assert r.status_code == 400


def test_too_many_items_refused(owner_client):
    items = [{"description": "x", "quantity": 1, "unit_price": 1}] * 51
    assert owner_client.post(ADMIN, body(items=items), format="json").status_code == 400


def test_update_draft_replaces_items(owner_client):
    made = draft(owner_client)
    r = owner_client.patch(
        f"{ADMIN}{made['id']}/", {"items": [{"description": "a", "quantity": 1, "unit_price": 5}]}, format="json"
    )
    assert r.status_code == 200 and r.data["total"] == 5 and len(r.data["items"]) == 1


def test_delete_draft_only(owner_client):
    made = draft(owner_client)
    sent = issued(owner_client)
    assert owner_client.delete(f"{ADMIN}{sent['id']}/").status_code == 409
    assert owner_client.delete(f"{ADMIN}{made['id']}/").status_code == 204


def test_list_filters_and_search(owner_client):
    issued(owner_client, customer_name="رضا")
    draft(owner_client, customer_name="مریم")
    assert owner_client.get(ADMIN, {"status": "draft"}).data["count"] == 1
    assert owner_client.get(ADMIN, {"q": "رضا"}).data["count"] == 1
    assert owner_client.get(ADMIN).data["count"] == 2


def test_expired_filter(owner_client):
    sent = issued(owner_client)
    Proforma.objects.filter(pk=sent["id"]).update(valid_until=timezone.localdate() - timedelta(days=1))
    assert owner_client.get(ADMIN, {"status": "expired"}).data["count"] == 1
    assert owner_client.get(f"{ADMIN}{sent['id']}/").data["status"] == "expired"


# ---- issuing ---------------------------------------------------------------------------------------


def test_issue_numbers_freezes_and_links(owner_client):
    one, two = issued(owner_client), issued(owner_client)
    year = service.jalali_year(timezone.localdate())
    assert one["number"] == f"3E-{year}-0001" and two["number"] == f"3E-{year}-0002"
    assert one["status"] == "sent" and one["link"].startswith("http")
    assert owner_client.patch(f"{ADMIN}{one['id']}/", {"customer_name": "x"}, format="json").status_code == 400
    assert owner_client.post(f"{ADMIN}{one['id']}/issue/").status_code == 409


def test_issue_validates(owner_client):
    empty = owner_client.post(ADMIN, body(items=[]), format="json").data
    assert owner_client.post(f"{ADMIN}{empty['id']}/issue/").status_code == 400
    past = draft(owner_client)
    Proforma.objects.filter(pk=past["id"]).update(valid_until=timezone.localdate() - timedelta(days=1))
    assert owner_client.post(f"{ADMIN}{past['id']}/issue/").status_code == 400


def test_issue_moves_the_inquiry_forward(owner_client):
    inquiry = Inquiry.objects.create(name="ا", phone="0912")
    r = owner_client.post(f"{ADMIN}from-inquiry/", {"inquiry": inquiry.pk}, format="json")
    assert r.status_code == 201 and r.data["customer_name"] == "ا" and r.data["inquiry"] == inquiry.pk
    Proforma.objects.filter(pk=r.data["id"]).update()
    ProformaItem.objects.create(proforma_id=r.data["id"], description="d", quantity=1, unit_price=1)
    assert owner_client.post(f"{ADMIN}{r.data['id']}/issue/").status_code == 200
    inquiry.refresh_from_db()
    assert inquiry.status == "proforma_sent" and inquiry.history.count() == 1


def test_from_inquiry_prices_the_middle_of_the_range(owner_client):
    inquiry = Inquiry.objects.create(
        name="ا", phone="0912", service_key="food", service_label="غذا", quantity=4,
        estimate_low=1_000_000, estimate_high=2_000_000, options={"addons": [{"key": "v", "label": "ویدیو"}]},
    )  # fmt: skip
    r = owner_client.post(f"{ADMIN}from-inquiry/", {"inquiry": inquiry.pk}, format="json")
    assert r.data["total"] == 1_500_000 and r.data["items"][0]["quantity"] == 4
    assert "ویدیو" in r.data["items"][0]["description"]
    assert owner_client.post(f"{ADMIN}from-inquiry/", {"inquiry": 99999}, format="json").status_code == 404


# ---- revisions, links, cancel ---------------------------------------------------------------------


def test_revision_supersedes_only_when_issued(owner_client):
    first = issued(owner_client)
    rev = owner_client.post(f"{ADMIN}{first['id']}/revise/")
    assert rev.status_code == 200 and rev.data["status"] == "draft" and rev.data["replaces"] == first["id"]
    assert owner_client.post(f"{ADMIN}{first['id']}/revise/").data["id"] == rev.data["id"]  # one open revision
    assert owner_client.get(f"{ADMIN}{first['id']}/").data["status"] == "sent"
    assert owner_client.post(f"{ADMIN}{rev.data['id']}/issue/").status_code == 200
    assert owner_client.get(f"{ADMIN}{first['id']}/").data["status"] == "superseded"
    # the old link now says it was replaced, it is not a 404
    r = APIClient().post(f"{PUBLIC}{token_of(first)}/approve")
    assert r.status_code == 409 and r.data["code"] == "superseded"


def test_cannot_revise_approved_or_draft(owner_client):
    one = issued(owner_client)
    APIClient().post(f"{PUBLIC}{token_of(one)}/approve")
    assert owner_client.post(f"{ADMIN}{one['id']}/revise/").status_code == 409
    assert owner_client.post(f"{ADMIN}{draft(owner_client)['id']}/revise/").status_code == 409


def test_replaced_approved_is_refused_at_issue(owner_client):
    one = issued(owner_client)
    rev = owner_client.post(f"{ADMIN}{one['id']}/revise/").data
    APIClient().post(f"{PUBLIC}{token_of(one)}/approve")  # approved while the revision is a draft
    assert owner_client.post(f"{ADMIN}{rev['id']}/issue/").status_code == 409


def test_new_link_cancels_the_old_one_and_is_stable(owner_client):
    one = issued(owner_client)
    assert owner_client.get(f"{ADMIN}{one['id']}/").data["link"] == one["link"]  # always retrievable
    fresh = owner_client.post(f"{ADMIN}{one['id']}/new-link/").data
    assert fresh["link"] != one["link"]
    assert APIClient().get(f"{PUBLIC}{token_of(one)}").status_code == 404
    assert APIClient().get(f"{PUBLIC}{token_of(fresh)}").status_code == 200
    assert owner_client.post(f"{ADMIN}{draft(owner_client)['id']}/new-link/").status_code == 409


def test_cancel(owner_client):
    one = issued(owner_client)
    assert owner_client.post(f"{ADMIN}{one['id']}/cancel/").data["status"] == "cancelled"
    assert owner_client.post(f"{ADMIN}{one['id']}/cancel/").status_code == 409
    r = APIClient().post(f"{PUBLIC}{token_of(one)}/approve")
    assert r.status_code == 409 and r.data["code"] == "cancelled"


def test_settings_roundtrip(owner_client):
    r = owner_client.patch(f"{ADMIN}settings/", {"issuer_name_fa": "سودا", "default_validity_days": 7}, format="json")
    assert r.status_code == 200 and owner_client.get(f"{ADMIN}settings/").data["issuer_name_fa"] == "سودا"
    sent = issued(owner_client)
    assert sent["issuer"]["name"] == "سودا"
    owner_client.patch(f"{ADMIN}settings/", {"issuer_name_fa": "عوض شد"}, format="json")
    assert owner_client.get(f"{ADMIN}{sent['id']}/").data["issuer"]["name"] == "سودا"  # frozen at issue


# ---- the signed link -------------------------------------------------------------------------------


def test_token_checks():
    p = Proforma.objects.create(customer_name="x", status="sent")
    assert find_by_token(make_token(p)) == p
    pub, sig = make_token(p).split("_", 1)
    for bad in [
        "",
        "x",
        f"{pub}_",
        f"{pub}_{sig[:-2]}ab",
        f"{'0' * 32}_{sig}",
        f"zz_{sig}",
        pub,
        f"{pub}.{sig}",
        f"{pub}-{sig}",
    ]:
        assert find_by_token(bad) is None
    p.status = "draft"
    p.save()
    assert find_by_token(make_token(p)) is None  # a draft has no public face


def test_public_get_does_not_mutate_and_hides_internals(owner_client):
    one = issued(owner_client)
    r = APIClient().get(f"{PUBLIC}{token_of(one)}")
    assert r.status_code == 200 and r["Cache-Control"] == "no-store" and r.data["status"] == "sent"
    assert Proforma.objects.get(pk=one["id"]).seen_at is None
    assert not {"id", "inquiry", "response_ip_hash", "link", "replaces"} & set(r.data)
    assert r.data["items"][0]["line_total"] == 2_000_000


def test_seen_is_idempotent_and_only_from_sent(owner_client):
    one = issued(owner_client)
    c = APIClient()
    assert c.post(f"{PUBLIC}{token_of(one)}/seen").data["status"] == "viewed"
    first = Proforma.objects.get(pk=one["id"]).seen_at
    c.post(f"{PUBLIC}{token_of(one)}/seen")
    assert Proforma.objects.get(pk=one["id"]).seen_at == first


def test_unknown_token_is_404_everywhere():
    c = APIClient()
    for suffix, method in [("", c.get), ("/seen", c.post), ("/approve", c.post), ("/reject", c.post), ("/pdf", c.get)]:
        r = method(f"{PUBLIC}nope{suffix}")
        assert r.status_code == 404 and r["Cache-Control"] == "no-store", suffix


def test_approve_once_then_idempotent_and_opposite_refused(owner_client):
    one = issued(owner_client)
    c, t = APIClient(), token_of(one)
    a = c.post(f"{PUBLIC}{t}/approve", HTTP_USER_AGENT="UA/1")
    assert a.status_code == 200 and a.data["status"] == "approved"
    p = Proforma.objects.get(pk=one["id"])
    stamp = p.responded_at
    assert p.response_user_agent == "UA/1" and len(p.response_ip_hash) == 64 and "." not in p.response_ip_hash
    assert c.post(f"{PUBLIC}{t}/approve").data["status"] == "approved"
    assert Proforma.objects.get(pk=one["id"]).responded_at == stamp
    r = c.post(f"{PUBLIC}{t}/reject", {"reason": "x"}, format="json")
    assert r.status_code == 409 and r.data["code"] == "already_answered"
    assert AuditLog.objects.filter(action="proformas.proforma.approved").count() == 1


def test_reject_with_reason(owner_client):
    one = issued(owner_client)
    c, t = APIClient(), token_of(one)
    r = c.post(f"{PUBLIC}{t}/reject", {"reason": "گران است"}, format="json")
    assert r.data["status"] == "rejected" and r.data["rejection_reason"] == "گران است"
    assert c.post(f"{PUBLIC}{t}/reject", format="json").data["status"] == "rejected"
    assert c.post(f"{PUBLIC}{t}/approve").status_code == 409


def test_reject_reason_too_long(owner_client):
    one = issued(owner_client)
    r = APIClient().post(f"{PUBLIC}{token_of(one)}/reject", {"reason": "x" * 501}, format="json")
    assert r.status_code == 400


def test_expired_cannot_be_answered(owner_client):
    one = issued(owner_client)
    Proforma.objects.filter(pk=one["id"]).update(valid_until=timezone.localdate() - timedelta(days=1))
    r = APIClient().post(f"{PUBLIC}{token_of(one)}/approve")
    assert r.status_code == 409 and r.data["code"] == "expired"
    assert APIClient().get(f"{PUBLIC}{token_of(one)}").data["status"] == "expired"


def test_public_rate_limit(owner_client, monkeypatch):
    from rest_framework.throttling import ScopedRateThrottle

    monkeypatch.setattr(
        ScopedRateThrottle, "THROTTLE_RATES", {**ScopedRateThrottle.THROTTLE_RATES, "proforma": "2/min"}
    )
    c = APIClient()
    codes = [c.get(f"{PUBLIC}nope").status_code for _ in range(3)]
    assert codes == [404, 404, 429]


# ---- PDF -------------------------------------------------------------------------------------------


def test_pdf_for_owner_and_customer(owner_client):
    one = issued(owner_client)
    for response in (owner_client.get(f"{ADMIN}{one['id']}/pdf/"), APIClient().get(f"{PUBLIC}{token_of(one)}/pdf")):
        assert response.status_code == 200 and response["Content-Type"] == "application/pdf"
        assert "attachment" in response["Content-Disposition"] and response["Cache-Control"] == "no-store"
        assert response.content.startswith(b"%PDF")
        assert len(PdfReader(io.BytesIO(response.content)).pages) == 1
    assert "/" not in owner_client.get(f"{ADMIN}{one['id']}/pdf/")["Content-Disposition"].split("filename=")[1]


def test_pdf_english_draft_and_many_items(owner_client):
    items = [{"description": f"item {i} " + "long " * 20, "quantity": i + 1, "unit_price": 1000} for i in range(40)]
    made = draft(owner_client, language="en", items=items, discount_percent="10", tax_percent="9")
    pdf = owner_client.get(f"{ADMIN}{made['id']}/pdf/")
    assert pdf.status_code == 200 and len(PdfReader(io.BytesIO(pdf.content)).pages) >= 2


def test_pdf_renders_the_numbers_and_stamp(owner_client):
    one = issued(owner_client, language="en")
    APIClient().post(f"{PUBLIC}{token_of(one)}/approve")
    text = "".join(
        p.extract_text() for p in PdfReader(io.BytesIO(render_pdf(Proforma.objects.get(pk=one["id"])))).pages
    )
    assert "2,000,000" in text and "Approved by the customer" in text and one["number"] in text


def test_pdf_markup_in_text_is_escaped_not_executed(owner_client):
    evil = '<img src="file:///etc/passwd"><link rel=stylesheet href="http://127.0.0.1/x">'
    made = draft(owner_client, customer_name=evil, terms=evil)
    assert owner_client.get(f"{ADMIN}{made['id']}/pdf/").status_code == 200


def test_fetcher_allows_only_data_and_our_fonts():
    f = SafeFetcher()
    for bad in ["http://127.0.0.1/", "https://example.com/x.css", "file:///etc/passwd", "ftp://x/y"]:
        with pytest.raises(ValueError):
            f.fetch(bad)
    from apps.proformas.pdf import ASSETS

    assert f.fetch((ASSETS / "Vazirmatn-Regular.ttf").as_uri())


def test_number_and_date_text():
    assert number_text(1234567, "fa") == "۱٬۲۳۴٬۵۶۷" and number_text(1234567, "en") == "1,234,567"
    from datetime import date

    assert date_text(date(2026, 3, 21), "fa") == "۱۴۰۵/۰۱/۰۱" and date_text(None, "fa") == ""
    assert date_text(date(2026, 3, 21), "en") == "2026-03-21"


def test_numbering_is_per_jalali_year():
    assert service.jalali_year(__import__("datetime").date(2026, 3, 20)) == 1404
    assert service._next_number(1500) == 1 and service._next_number(1500) == 2 and service._next_number(1501) == 1


def test_unauthenticated_admin_is_refused():
    assert APIClient().get(ADMIN).status_code in (401, 403)
