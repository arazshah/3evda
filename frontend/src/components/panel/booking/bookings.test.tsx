import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { addDays, todayIso } from "@/lib/calendar/jalali";
import { fakeApi, renderWithQuery } from "@/test/render";
import { BookingBadge } from "./BookingBadge";
import { BookingDetailPage } from "./BookingDetail";
import { BookingsManager } from "./BookingsManager";
import { LinkedBookings } from "./LinkedBookings";
import { NewBookingPage } from "./NewBooking";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

beforeEach(() => {
  push.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

const LIST = "/api/admin/bookings/";
const page = (results: unknown[], count = results.length) => ({ count, next: null, previous: null, results });
const row = (id: number, name: string, extra = {}) => ({
  id,
  status: "pending",
  session_label: "استودیو",
  session_type: 1,
  start_at: "2026-10-20T06:30:00Z",
  end_at: "2026-10-20T07:30:00Z",
  date: todayIso(),
  time: "10:00",
  end_time: "11:00",
  name,
  brand: "",
  phone: "0912",
  package_label: "",
  is_new: true,
  ...extra,
});
const detail = (extra = {}) => ({
  ...row(7, "سارا", { brand: "کافه", is_new: false }),
  language: "fa",
  whatsapp: "09121111111",
  telegram: "@sara",
  email: "s@example.com",
  notes: "منوی جدید",
  package: null,
  inquiry: 4,
  proforma: null,
  internal_note: "",
  seen_at: "2026-10-03T10:00:00Z",
  cancelled_by: "",
  cancel_reason: "",
  created_by_admin: false,
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:00:00Z",
  link: "https://3evda.com/b/abc_def",
  ...extra,
});

describe("BookingBadge", () => {
  it("shows the number of bookings waiting for an answer, and nothing when there are none", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([{ method: "GET", path: `${LIST}summary/`, body: { pending: 3 } }]).fetchImpl,
    );
    renderWithQuery(<BookingBadge />);
    expect(await screen.findByText(/رزرو در انتظار تأیید/)).toBeInTheDocument();
    vi.stubGlobal(
      "fetch",
      fakeApi([{ method: "GET", path: `${LIST}summary/`, body: { pending: 0 } }]).fetchImpl,
    );
  });
});

describe("BookingsManager", () => {
  it("shows a count under each day of the month, and the bookings of the chosen day", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: LIST,
        body: page([row(1, "الف"), row(2, "ب"), row(3, "لغو‌شده", { status: "cancelled" })]),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingsManager />);
    await waitFor(() => expect(api.calls.length).toBeGreaterThan(0));
    const params = new URLSearchParams(api.calls[0]!.search);
    expect(params.get("page_size")).toBe("500");
    expect(params.get("from")! < params.get("to")!).toBe(true);

    // two active bookings today (the cancelled one is not counted)
    await screen.findByRole("grid");
    await waitFor(() => expect(document.querySelector("td button span.text-xs")).not.toBeNull());
    const today = Array.from(document.querySelectorAll("td button")).find(
      (b) => b.querySelector("span.text-xs")?.textContent === "۲",
    );
    expect(today).toBeTruthy();
    fireEvent.click(today as HTMLElement);
    const list = await screen.findByRole("list", { name: "رزروهای این روز" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getAllByRole("link")[0]).toHaveAttribute("href", "/panel/booking/1");
  });

  it("forgets the chosen day when the month changes", async () => {
    const api = fakeApi([
      { method: "GET", path: LIST, body: page([row(1, "الف")]) },
      { method: "GET", path: LIST, body: page([]) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingsManager />);
    await waitFor(() => expect(document.querySelector("td button span.text-xs")).not.toBeNull());
    fireEvent.click(document.querySelector("td button span.text-xs")!.closest("button") as HTMLElement);
    await screen.findByRole("list", { name: "رزروهای این روز" });
    fireEvent.click(screen.getByRole("button", { name: "ماه بعد" }));
    await waitFor(() => expect(screen.getByText(/یک روز را انتخاب کنید/)).toBeInTheDocument());
    expect(screen.queryByText("رزروی در این روز نیست.")).not.toBeInTheDocument();
  });

  it("shows the week from Saturday, with the bookings under their days", async () => {
    const api = fakeApi([
      { method: "GET", path: LIST, body: page([]) },
      { method: "GET", path: LIST, body: page([row(5, "هفتگی")]) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingsManager />);
    fireEvent.click(screen.getByRole("tab", { name: "هفته" }));
    expect(await screen.findByText("هفتگی")).toBeInTheDocument();
    const week = new URLSearchParams(api.calls.at(-1)!.search);
    expect(addDays(week.get("from")!, 6)).toBe(week.get("to"));
    expect(new Date(`${week.get("from")}T00:00:00Z`).getUTCDay()).toBe(6); // a Saturday
  });

  it("lists, filters on the server and pages", async () => {
    const api = fakeApi([
      { method: "GET", path: LIST, body: page([]) },
      { method: "GET", path: LIST, body: page([row(1, "الف")], 45) },
      { method: "GET", path: LIST, body: page([row(2, "ب")], 45) },
      { method: "GET", path: LIST, body: page([row(3, "ج")], 1) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingsManager />);
    fireEvent.click(screen.getByRole("tab", { name: "فهرست" }));
    await screen.findByText("الف");
    fireEvent.click(screen.getByRole("button", { name: "صفحه‌ی بعد" }));
    await screen.findByText("ب");
    expect(api.calls.at(-1)!.search).toContain("page=2");
    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "confirmed" } });
    await screen.findByText("ج");
    const params = new URLSearchParams(api.calls.at(-1)!.search);
    expect(params.get("status")).toBe("confirmed");
    expect(params.has("page")).toBe(false);
  });
});

describe("BookingDetailPage", () => {
  const load = (extra = {}, more: Parameters<typeof fakeApi>[0] = []) =>
    fakeApi([
      { method: "GET", path: `${LIST}7/`, body: detail(extra) },
      { method: "GET", path: LIST, body: page([]) },
      { method: "GET", path: `${LIST}summary/`, body: { pending: 0 } },
      ...more,
    ]);

  it("shows who, when, the contact links and the links to the enquiry", async () => {
    vi.stubGlobal("fetch", load().fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    expect(await screen.findByRole("heading", { level: 1 })).toHaveTextContent("سارا · کافه");
    expect(screen.getByRole("link", { name: "09121111111" })).toHaveAttribute(
      "href",
      "https://wa.me/989121111111",
    );
    expect(screen.getByRole("link", { name: "@sara" })).toHaveAttribute("href", "https://t.me/sara");
    expect(screen.getByRole("link", { name: "مشاهده" })).toHaveAttribute("href", "/panel/inquiries/4");
    expect(screen.getByLabelText("لینک وضعیت برای مشتری")).toHaveValue("https://3evda.com/b/abc_def");
  });

  it("confirms a waiting booking", async () => {
    const api = load({}, [
      { method: "POST", path: `${LIST}7/confirm/`, body: detail({ status: "confirmed" }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "تأیید رزرو" }));
    expect(await screen.findByText("رزرو تأیید شد.")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "تأیید رزرو" })).not.toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ثبت «انجام‌شده»" })).toBeInTheDocument();
  });

  it("rejects with a reason after a confirmation", async () => {
    const api = load({}, [
      {
        method: "POST",
        path: `${LIST}7/cancel/`,
        body: detail({ status: "cancelled", cancelled_by: "admin", cancel_reason: "پر است" }),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    fireEvent.change(await screen.findByLabelText(/دلیل \(اختیاری/), { target: { value: " پر است " } });
    fireEvent.click(screen.getByRole("button", { name: "رد رزرو" }));
    expect(await screen.findByText("رزرو لغو شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.endsWith("/cancel/"))!.body).toEqual({ reason: "پر است" });
    expect(screen.queryByRole("button", { name: "رد رزرو" })).not.toBeInTheDocument();
  });

  it("does nothing when the confirmation question is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = load();
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "رد رزرو" }));
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("moves it, and shows the server's refusal when the time is taken", async () => {
    const api = load({}, [
      {
        method: "POST",
        path: `${LIST}7/reschedule/`,
        status: 409,
        body: { code: "slot_taken", detail: "این ساعت دیگر آزاد نیست." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    fireEvent.change(await screen.findByLabelText("ساعت جدید"), { target: { value: "14:30" } });
    fireEvent.click(screen.getByRole("button", { name: "جابه‌جا کن" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("این ساعت دیگر آزاد نیست.");
    expect(api.calls.find((c) => c.path.endsWith("/reschedule/"))!.body).toMatchObject({
      time: "14:30",
      date: todayIso(),
    });
  });

  it("offers no actions on a cancelled booking and says who cancelled it", async () => {
    vi.stubGlobal("fetch", load({ status: "cancelled", cancelled_by: "customer" }).fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    expect(await screen.findByText("توسط مشتری")).toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "رد رزرو" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "جابه‌جا کن" })).not.toBeInTheDocument();
  });

  it("saves the private note", async () => {
    const api = load({}, [
      { method: "PATCH", path: `${LIST}7/`, body: detail({ internal_note: "تماس گرفتم" }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingDetailPage id={7} />);
    fireEvent.change(await screen.findByLabelText("یادداشت داخلی"), { target: { value: "تماس گرفتم" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی یادداشت" }));
    expect(await screen.findByText("یادداشت ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toEqual({ internal_note: "تماس گرفتم" });
  });
});

describe("NewBookingPage", () => {
  const types = [
    {
      id: 1,
      key: "studio",
      title_fa: "استودیو",
      title_en: "",
      duration_minutes: 60,
      buffer_minutes: 0,
      is_active: true,
      position: 0,
    },
    {
      id: 2,
      key: "old",
      title_fa: "قدیمی",
      title_en: "",
      duration_minutes: 60,
      buffer_minutes: 0,
      is_active: false,
      position: 1,
    },
  ];

  it("creates a booking and opens it", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/booking/session-types/", body: types },
      { method: "POST", path: LIST, status: 201, body: detail({ id: 12 }) },
      { method: "GET", path: LIST, body: page([]) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<NewBookingPage inquiryId={null} proformaId={null} />);
    fireEvent.change(await screen.findByLabelText("نام مشتری"), { target: { value: " رضا " } });
    fireEvent.change(screen.getByLabelText("تلفن"), { target: { value: "0912" } });
    fireEvent.change(screen.getByLabelText("ساعت"), { target: { value: "15:00" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت رزرو" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/booking/12"));
    expect(api.calls.find((c) => c.method === "POST")!.body).toMatchObject({
      session_type: 1,
      time: "15:00",
      status: "confirmed",
      name: "رضا",
      phone: "0912",
      inquiry: null,
      proforma: null,
    });
  });

  it("is filled from the enquiry it comes from, and keeps the link to it and to the proforma", async () => {
    const inquiry = {
      id: 4,
      name: "سارا",
      brand: "کافه",
      phone: "0912",
      whatsapp: "",
      telegram: "",
      email: "",
      language: "en",
    };
    const api = fakeApi([
      { method: "GET", path: "/api/admin/booking/session-types/", body: types },
      { method: "GET", path: "/api/admin/inquiries/4/", body: inquiry },
      { method: "GET", path: "/api/admin/inquiries/", body: page([]) },
      { method: "GET", path: "/api/admin/inquiries/summary/", body: { new: 0 } },
      { method: "POST", path: LIST, status: 201, body: detail({ id: 13 }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<NewBookingPage inquiryId={4} proformaId={9} />);
    expect(await screen.findByLabelText("نام مشتری")).toHaveValue("سارا");
    expect(screen.getByLabelText("زبان صفحه‌ی مشتری")).toHaveValue("en");
    fireEvent.click(screen.getByRole("button", { name: "ثبت رزرو" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/booking/13"));
    expect(api.calls.find((c) => c.method === "POST")!.body).toMatchObject({
      inquiry: 4,
      proforma: 9,
      language: "en",
      brand: "کافه",
    });
  });

  it("shows the server's refusal and stays", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/booking/session-types/", body: types },
      {
        method: "POST",
        path: LIST,
        status: 409,
        body: { code: "slot_taken", detail: "این ساعت دیگر آزاد نیست." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<NewBookingPage inquiryId={null} proformaId={null} />);
    fireEvent.change(await screen.findByLabelText("نام مشتری"), { target: { value: "رضا" } });
    fireEvent.click(screen.getByRole("button", { name: "ثبت رزرو" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("این ساعت دیگر آزاد نیست.");
    expect(push).not.toHaveBeenCalled();
  });
});

describe("LinkedBookings", () => {
  it("lists the bookings made for an enquiry and links to making another", async () => {
    const api = fakeApi([{ method: "GET", path: LIST, body: page([row(1, "الف")]) }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<LinkedBookings inquiry={4} proforma={9} />);
    expect(await screen.findByRole("list", { name: "رزروهای وصل‌شده" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "ساخت رزرو" })).toHaveAttribute(
      "href",
      "/panel/booking/new?inquiry=4&proforma=9",
    );
    expect(new URLSearchParams(api.calls[0]!.search).get("inquiry")).toBe("4");
  });

  it("shows a failure instead of claiming there are none", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([
        { method: "GET", path: LIST, status: 500, body: { code: "server_error", detail: "خطای سرور" } },
      ]).fetchImpl,
    );
    renderWithQuery(<LinkedBookings inquiry={4} />);
    expect(await screen.findByRole("alert")).toHaveTextContent("خطای سرور");
    expect(screen.queryByText("هنوز رزروی وصل نشده است.")).not.toBeInTheDocument();
  });

  it("asks for as many as the server allows and says when it still shows only some", async () => {
    const api = fakeApi([{ method: "GET", path: LIST, body: page([row(1, "الف")], 700) }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<LinkedBookings inquiry={4} />);
    expect(await screen.findByText(/۱ رزرو از ۷۰۰ نشان داده شد/)).toBeInTheDocument();
    expect(new URLSearchParams(api.calls[0]!.search).get("page_size")).toBe("500");
  });

  it("says so when there are none", async () => {
    vi.stubGlobal("fetch", fakeApi([{ method: "GET", path: LIST, body: page([]) }]).fetchImpl);
    renderWithQuery(<LinkedBookings inquiry={4} />);
    expect(await screen.findByText("هنوز رزروی وصل نشده است.")).toBeInTheDocument();
  });
});
