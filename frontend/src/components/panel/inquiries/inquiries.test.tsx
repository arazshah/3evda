import { act, fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { InquiriesManager } from "./InquiriesManager";
import { InquiryBadge } from "./InquiryBadge";
import { InquiryDetailPage } from "./InquiryDetail";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

beforeEach(() => push.mockClear());
afterEach(() => vi.unstubAllGlobals());

const LIST = "/api/admin/inquiries/";
const SUMMARY = "/api/admin/inquiries/summary/";

const row = (id: number, name: string, extra = {}) => ({
  id,
  name,
  brand: "",
  service_label: "عکاسی غذا",
  quantity: 4,
  estimate_low: 850000,
  estimate_high: 1150000,
  status: "new",
  created_at: "2026-10-03T10:00:00Z",
  is_new: true,
  attachment_count: 0,
  ...extra,
});
const page = (results: unknown[], count = results.length) => ({ count, next: null, previous: null, results });

const detail = (extra = {}) => ({
  id: 7,
  name: "سارا",
  brand: "کافه ماه",
  phone: "09120000000",
  whatsapp: "09121111111",
  telegram: "@sara",
  email: "sara@example.com",
  language: "en",
  service_key: "food",
  service_label: "عکاسی غذا",
  quantity: 4,
  options: {
    addons: [{ key: "video", label: "ویدیو" }],
    multipliers: [{ key: "urgent", label: "فوری" }],
  },
  estimate_low: 850000,
  estimate_high: 1150000,
  message: "سلام\nمنوی جدید",
  status: "new",
  internal_note: "",
  seen_at: "2026-10-03T10:05:00Z",
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:05:00Z",
  attachments: [{ id: 3, original_name: "brief.pdf", mime: "application/pdf", size: 2048 }],
  history: [],
  ...extra,
});

describe("InquiriesManager", () => {
  it("lists enquiries with their range, an «unread» marker and a link to each", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: LIST,
        body: page([
          row(1, "سارا", { brand: "کافه", attachment_count: 2 }),
          row(2, "رضا", { is_new: false, status: "reviewing" }),
        ]),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiriesManager />);

    const list = await screen.findByRole("list", { name: "استعلام‌ها" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByRole("link")).toHaveAttribute("href", "/panel/inquiries/1");
    expect(within(items[0]!).getByText("خوانده‌نشده")).toBeInTheDocument();
    expect(within(items[0]!).getByText(/سارا · کافه/)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/از .+ تا .+ تومان/)).toBeInTheDocument();
    expect(within(items[0]!).getByText(/پیوست/)).toBeInTheDocument();
    expect(within(items[1]!).queryByText("خوانده‌نشده")).not.toBeInTheDocument(); // opened already
    expect(within(items[1]!).getByText("در بررسی")).toBeInTheDocument();
  });

  it("sends the filters to the server and starts again from the first page", async () => {
    const api = fakeApi([
      { method: "GET", path: LIST, body: page([row(1, "الف")], 45) },
      { method: "GET", path: LIST, body: page([row(2, "ب")], 45) },
      { method: "GET", path: LIST, body: page([row(3, "ج")], 3) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiriesManager />);

    await screen.findByText("الف");
    expect(screen.getByText(/صفحه .+ از .+ \(.+ استعلام\)/)).toBeInTheDocument(); // 45 rows → 3 pages
    fireEvent.click(screen.getByRole("button", { name: "صفحه‌ی بعد" }));
    await screen.findByText("ب");
    expect(api.calls.at(-1)?.search).toBe("?page=2");

    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "reviewing" } });
    await screen.findByText("ج");
    const params = new URLSearchParams(api.calls.at(-1)?.search);
    expect(params.get("status")).toBe("reviewing");
    expect(params.has("page")).toBe(false); // back to page one
  });

  it("searches a moment after typing stops", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const api = fakeApi([
        { method: "GET", path: LIST, body: page([row(1, "الف")]) },
        { method: "GET", path: LIST, body: page([row(2, "ماه")]) },
      ]);
      vi.stubGlobal("fetch", api.fetchImpl);
      renderWithQuery(<InquiriesManager />);
      await screen.findByText("الف");

      fireEvent.change(screen.getByLabelText("جست‌وجو"), { target: { value: "ماه" } });
      expect(api.calls).toHaveLength(1); // not yet
      await act(async () => {
        await vi.advanceTimersByTimeAsync(400);
      });
      await screen.findByText("ماه");
      expect(new URLSearchParams(api.calls.at(-1)?.search).get("q")).toBe("ماه");
    } finally {
      vi.useRealTimers();
    }
  });

  it("offers a CSV of everything that matches the filters", async () => {
    const api = fakeApi([
      { method: "GET", path: LIST, body: page([row(1, "الف")]) },
      { method: "GET", path: LIST, body: page([]) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiriesManager />);
    await screen.findByText("الف");
    expect(screen.getByRole("link", { name: "دانلود CSV" })).toHaveAttribute(
      "href",
      "/api/admin/inquiries/export/",
    );

    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "closed" } });
    fireEvent.change(screen.getByLabelText("از تاریخ"), { target: { value: "2026-10-01" } });
    await waitFor(() => {
      const href = screen.getByRole("link", { name: "دانلود CSV" }).getAttribute("href")!;
      const params = new URLSearchParams(href.split("?")[1]);
      expect(params.get("status")).toBe("closed");
      expect(params.get("from")).toBe("2026-10-01");
      expect(params.has("page")).toBe(false);
    });
  });

  it("says so when nothing matches", async () => {
    const api = fakeApi([{ method: "GET", path: LIST, body: page([]) }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiriesManager />);
    expect(await screen.findByText("استعلامی با این فیلترها پیدا نشد.")).toBeInTheDocument();
  });
});

describe("InquiryBadge", () => {
  it("shows how many enquiries are unopened, with a readable label", async () => {
    const api = fakeApi([{ method: "GET", path: SUMMARY, body: { new: 3 } }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryBadge />);
    expect(await screen.findByText(/استعلام خوانده‌نشده$/)).toBeInTheDocument();
  });

  it("is absent when there is nothing new", async () => {
    const api = fakeApi([{ method: "GET", path: SUMMARY, body: { new: 0 } }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const { container } = renderWithQuery(<InquiryBadge />);
    await waitFor(() => expect(api.calls).toHaveLength(1));
    expect(container).toBeEmptyDOMElement();
  });
});

describe("InquiryDetailPage", () => {
  const DETAIL = "/api/admin/inquiries/7/";

  it("shows the contact details, the request with its estimate, and safe attachment links", async () => {
    const api = fakeApi([{ method: "GET", path: DETAIL, body: detail() }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);

    expect(await screen.findByRole("heading", { level: 1, name: /سارا · کافه ماه/ })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "09120000000" })).toHaveAttribute("href", "tel:09120000000");
    expect(screen.getByRole("link", { name: "sara@example.com" })).toHaveAttribute(
      "href",
      "mailto:sara@example.com",
    );
    expect(screen.getByRole("link", { name: "@sara" })).toHaveAttribute(
      "href",
      expect.stringContaining("t.me/sara"),
    );
    expect(screen.getByText(/عکاسی غذا/)).toBeInTheDocument();
    expect(screen.getByText("ویدیو")).toBeInTheDocument();
    expect(screen.getByText("فوری")).toBeInTheDocument();
    expect(screen.getByText(/از .+ تا .+ تومان/)).toBeInTheDocument();
    expect(screen.getByText(/منوی جدید/)).toBeInTheDocument();
    expect(screen.getByText(/فرم انگلیسی/)).toBeInTheDocument();

    const files = screen.getByRole("list", { name: "پیوست‌ها" });
    expect(within(files).getByRole("link", { name: /brief\.pdf/ })).toHaveAttribute(
      "href",
      "/api/admin/inquiries/7/attachments/3/",
    );
  });

  it("sends only what changed and shows the saved result", async () => {
    const api = fakeApi([
      { method: "GET", path: DETAIL, body: detail() },
      {
        method: "PATCH",
        path: DETAIL,
        body: detail({
          status: "reviewing",
          history: [{ from_status: "new", to_status: "reviewing", at: "2026-10-03T11:00:00Z" }],
        }),
      },
      { method: "GET", path: LIST, body: page([]) },
      { method: "GET", path: SUMMARY, body: { new: 0 } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);

    const save = await screen.findByRole("button", { name: "ذخیره" });
    expect(save).toBeDisabled(); // nothing to save yet
    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "reviewing" } });
    fireEvent.click(save);

    expect(await screen.findByText("ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ status: "reviewing" }); // no note sent
    const history = await screen.findByRole("list", { name: "تاریخچه‌ی وضعیت" });
    expect(history).toHaveTextContent("جدید");
    expect(history).toHaveTextContent("در بررسی");
  });

  it("saves the internal note alone", async () => {
    const api = fakeApi([
      { method: "GET", path: DETAIL, body: detail() },
      { method: "PATCH", path: DETAIL, body: detail({ internal_note: "تماس گرفتم" }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);

    fireEvent.change(await screen.findByLabelText("یادداشت داخلی"), { target: { value: "تماس گرفتم" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText("ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ internal_note: "تماس گرفتم" });
  });

  it("shows the server's message when saving fails", async () => {
    const api = fakeApi([
      { method: "GET", path: DETAIL, body: detail() },
      {
        method: "PATCH",
        path: DETAIL,
        status: 400,
        body: { code: "validation_error", detail: "وضعیت معتبر نیست." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);
    fireEvent.change(await screen.findByLabelText("وضعیت"), { target: { value: "closed" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText("وضعیت معتبر نیست.")).toBeInTheDocument();
  });

  it("deletes after confirmation and goes back to the list", async () => {
    const api = fakeApi([
      { method: "GET", path: DETAIL, body: detail() },
      { method: "DELETE", path: DETAIL, status: 204 },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const confirm = vi.fn(() => true);
    vi.stubGlobal("confirm", confirm);
    renderWithQuery(<InquiryDetailPage id={7} />);

    fireEvent.click(await screen.findByRole("button", { name: "حذف استعلام" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/inquiries"));
    expect(confirm).toHaveBeenCalled();
    // The deleted enquiry is not asked for again (that would be a 404 while the page is leaving).
    expect(api.calls.filter((c) => c.method === "GET" && c.path === DETAIL)).toHaveLength(1);
  });

  it("does not delete when the confirmation is declined", async () => {
    const api = fakeApi([{ method: "GET", path: DETAIL, body: detail() }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    vi.stubGlobal("confirm", () => false);
    renderWithQuery(<InquiryDetailPage id={7} />);
    fireEvent.click(await screen.findByRole("button", { name: "حذف استعلام" }));
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    expect(push).not.toHaveBeenCalled();
  });

  it("explains a missing enquiry", async () => {
    const api = fakeApi([
      { method: "GET", path: DETAIL, status: 404, body: { code: "not_found", detail: "پیدا نشد." } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);
    expect(await screen.findByText("پیدا نشد.")).toBeInTheDocument();
  });

  it("says when only a message was sent", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: DETAIL,
        body: detail({
          service_label: "",
          service_key: "",
          quantity: null,
          options: {},
          estimate_low: null,
          estimate_high: null,
          attachments: [],
        }),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<InquiryDetailPage id={7} />);
    expect(await screen.findByText(/ماشین‌حساب استفاده نشده/)).toBeInTheDocument();
    expect(screen.queryByRole("list", { name: "پیوست‌ها" })).not.toBeInTheDocument();
  });
});
