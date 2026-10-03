import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { ProformaEditorPage } from "./ProformaEditor";
import { ProformasManager } from "./ProformasManager";
import { ProformaSettingsForm } from "./ProformaSettingsForm";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

beforeEach(() => {
  push.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

const BASE = "/api/admin/proformas/";

const proforma = (extra = {}) => ({
  id: 5,
  number: null,
  status: "draft",
  language: "fa",
  customer_name: "علی",
  customer_company: "",
  customer_contact: "0912",
  inquiry: null,
  replaces: null,
  replaces_number: null,
  discount_amount: 0,
  discount_percent: "0.00",
  tax_percent: "9.00",
  subtotal: 2000000,
  discount: 0,
  tax: 180000,
  total: 2180000,
  terms: "شرایط",
  valid_until: "2026-12-01",
  issue_date: null,
  issued_at: null,
  issuer: {},
  seen_at: null,
  responded_at: null,
  rejection_reason: "",
  link: null,
  items: [{ description: "عکاسی غذا", quantity: 2, unit_price: 1000000, line_total: 2000000 }],
  created_at: "2026-10-03T10:00:00Z",
  updated_at: "2026-10-03T10:00:00Z",
  ...extra,
});
const issued = (extra = {}) =>
  proforma({ number: "3E-1405-0001", status: "sent", link: "https://3evda.com/p/abc.def", ...extra });

describe("ProformasManager", () => {
  it("lists proformas with number, total and status, and filters on the server", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: BASE,
        body: {
          count: 1,
          next: null,
          previous: null,
          results: [
            {
              id: 5,
              number: "3E-1405-0001",
              status: "viewed",
              language: "fa",
              customer_name: "علی",
              customer_company: "کافه",
              total: 2180000,
              valid_until: null,
              created_at: "2026-10-03T10:00:00Z",
            },
          ],
        },
      },
      { method: "GET", path: BASE, body: { count: 0, next: null, previous: null, results: [] } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformasManager />);
    const item = within(await screen.findByRole("list", { name: "پیش‌فاکتورها" })).getByRole("listitem");
    expect(within(item).getByRole("link")).toHaveAttribute("href", "/panel/proformas/5");
    expect(within(item).getByText("دیده‌شده")).toBeInTheDocument();
    expect(within(item).getByText(/علی · کافه/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "expired" } });
    await screen.findByText("پیش‌فاکتوری پیدا نشد.");
    expect(new URLSearchParams(api.calls.at(-1)?.search).get("status")).toBe("expired");
  });
});

describe("ProformaEditorPage", () => {
  it("creates a draft from the form and moves to it", async () => {
    const api = fakeApi([{ method: "POST", path: BASE, status: 201, body: proforma({ id: 9 }) }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={null} />);

    fireEvent.change(screen.getByLabelText("نام مشتری"), { target: { value: "  سارا " } });
    fireEvent.change(screen.getByLabelText("شرح آیتم ۱"), { target: { value: "ریلز" } });
    fireEvent.change(screen.getByLabelText("قیمت واحد آیتم ۱ (تومان)"), { target: { value: "500000" } });
    fireEvent.change(screen.getByLabelText("نوع تخفیف"), { target: { value: "percent" } });
    fireEvent.change(screen.getByLabelText("درصد تخفیف"), { target: { value: "10" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس" }));

    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/proformas/9"));
    expect(api.calls[0]!.body).toMatchObject({
      customer_name: "سارا",
      discount_amount: 0,
      discount_percent: "10",
      items: [{ description: "ریلز", quantity: 1, unit_price: 500000 }],
    });
  });

  it("shows the server's error and stays put", async () => {
    const api = fakeApi([
      {
        method: "POST",
        path: BASE,
        status: 400,
        body: { code: "invalid", detail: "نام مشتری را وارد کنید." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={null} />);
    fireEvent.change(screen.getByLabelText("نام مشتری"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت پیش‌نویس" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("نام مشتری را وارد کنید.");
    expect(push).not.toHaveBeenCalled();
  });

  it("saves the screen before issuing, then shows the issued view with its link", async () => {
    const api = fakeApi([
      { method: "GET", path: `${BASE}5/`, body: proforma() },
      { method: "PATCH", path: `${BASE}5/`, body: proforma({ terms: "جدید" }) },
      { method: "POST", path: `${BASE}5/issue/`, body: issued() },
      {
        method: "GET",
        path: "/api/admin/inquiries/",
        body: { count: 0, next: null, previous: null, results: [] },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={5} />);

    await screen.findByText("پیش‌نویس پیش‌فاکتور");
    fireEvent.change(screen.getByLabelText("شرایط"), { target: { value: "جدید" } });
    fireEvent.click(screen.getByRole("button", { name: "صدور" }));

    expect(await screen.findByLabelText("لینک عمومی")).toHaveValue("https://3evda.com/p/abc.def");
    const sequence = api.calls.filter((c) => c.method !== "GET").map((c) => `${c.method} ${c.path}`);
    expect(sequence).toEqual([`PATCH ${BASE}5/`, `POST ${BASE}5/issue/`]);
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toMatchObject({ terms: "جدید" });
  });

  it("does not issue when the confirmation is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = fakeApi([{ method: "GET", path: `${BASE}5/`, body: proforma() }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={5} />);
    await screen.findByText("پیش‌نویس پیش‌فاکتور");
    fireEvent.click(screen.getByRole("button", { name: "صدور" }));
    expect(api.calls.filter((c) => c.method !== "GET")).toHaveLength(0);
  });

  it("removes and adds item rows (never below one)", async () => {
    vi.stubGlobal("fetch", fakeApi([]).fetchImpl);
    renderWithQuery(<ProformaEditorPage id={null} />);
    expect(screen.getByRole("button", { name: "حذف آیتم ۱" })).toBeDisabled();
    fireEvent.click(screen.getByRole("button", { name: "افزودن آیتم" }));
    expect(within(screen.getByRole("list", { name: "آیتم‌ها" })).getAllByRole("listitem")).toHaveLength(2);
    fireEvent.click(screen.getByRole("button", { name: "حذف آیتم ۲" }));
    expect(within(screen.getByRole("list", { name: "آیتم‌ها" })).getAllByRole("listitem")).toHaveLength(1);
  });

  it("offers revise, new link and cancel on an open proforma, and revise opens the new draft", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: `${BASE}5/`,
        body: issued({ seen_at: "2026-10-04T09:00:00Z", status: "viewed" }),
      },
      {
        method: "POST",
        path: `${BASE}5/revise/`,
        body: proforma({ id: 6, replaces: 5, replaces_number: "3E-1405-0001" }),
      },
      {
        method: "GET",
        path: "/api/admin/inquiries/",
        body: { count: 0, next: null, previous: null, results: [] },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={5} />);
    await screen.findByText(/دیده‌شده · علی/);
    expect(screen.getByRole("button", { name: "لینک تازه" })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "لغو پیش‌فاکتور" })).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "دانلود PDF" })).toHaveAttribute("href", `${BASE}5/pdf/`);
    fireEvent.click(screen.getByRole("button", { name: "ساخت نسخه‌ی اصلاحی" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/proformas/6"));
  });

  it("an approved proforma can be neither revised nor cancelled", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: `${BASE}5/`,
        body: issued({ status: "approved", responded_at: "2026-10-05T09:00:00Z" }),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={5} />);
    await screen.findByText(/تأییدشده · علی/);
    expect(screen.queryByRole("button", { name: "ساخت نسخه‌ی اصلاحی" })).not.toBeInTheDocument();
    expect(screen.queryByRole("button", { name: "لغو پیش‌فاکتور" })).not.toBeInTheDocument();
  });

  it("shows why a proforma was rejected", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: `${BASE}5/`,
        body: issued({ status: "rejected", rejection_reason: "گران است" }),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaEditorPage id={5} />);
    expect(await screen.findByText("گران است")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "ساخت نسخه‌ی اصلاحی" })).toBeInTheDocument();
  });
});

describe("ProformaSettingsForm", () => {
  it("loads and saves the issuer information", async () => {
    const settings = {
      issuer_name_fa: "سودا",
      issuer_name_en: "",
      phone: "",
      address_fa: "",
      address_en: "",
      terms_fa: "",
      terms_en: "",
      footer_fa: "",
      footer_en: "",
      default_validity_days: 14,
      default_tax_percent: "0.00",
      updated_at: "2026-10-03T10:00:00Z",
    };
    const api = fakeApi([
      { method: "GET", path: `${BASE}settings/`, body: settings },
      { method: "PATCH", path: `${BASE}settings/`, body: { ...settings, phone: "0914" } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProformaSettingsForm />);
    expect(await screen.findByLabelText("نام صادرکننده (فارسی)")).toHaveValue("سودا");
    fireEvent.change(screen.getByLabelText("تلفن"), { target: { value: "0914" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText("ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.at(-1)!.body).toMatchObject({ phone: "0914", default_validity_days: 14 });
  });
});
