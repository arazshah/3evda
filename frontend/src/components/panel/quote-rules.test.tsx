import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { QuoteRulesManager } from "./QuoteRulesManager";

beforeEach(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

const rule = (id: number, key: string, kind: string, extra = {}) => ({
  id,
  key,
  kind,
  label_fa: `قاعده ${key}`,
  label_en: "",
  amount: null,
  factor: null,
  min_quantity: null,
  is_active: true,
  position: id,
  ...extra,
});

const settings = { range_percent: 15, rounding_step: 10000, min_quantity: 1, max_quantity: 200 };

const RULES = "/api/admin/pricing/rules/";
const SETTINGS = "/api/admin/pricing/quote-settings";

describe("QuoteRulesManager", () => {
  it("summarises each rule in the list, including its numbers", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: RULES,
        body: [
          rule(1, "food", "service", { amount: 1_000_000 }),
          rule(2, "t10", "tier", { factor: "0.900", min_quantity: 10 }),
          rule(3, "off", "multiplier", { factor: "1.500", is_active: false }),
        ],
      },
      { method: "GET", path: SETTINGS, body: settings },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<QuoteRulesManager />);

    const list = await screen.findByRole("list", { name: "قواعد قیمت" });
    expect(within(list).getByText(/قیمت پایه‌ی خدمت · .+ تومان/)).toBeInTheDocument();
    expect(within(list).getByText(/پله‌ی تعداد · از .+ محصول · ضریب/)).toBeInTheDocument();
    expect(within(list).getByText("غیرفعال")).toBeInTheDocument();
  });

  it("asks only for the fields a rule kind needs, and sends no stale numbers", async () => {
    const api = fakeApi([
      { method: "GET", path: RULES, body: [] },
      { method: "GET", path: SETTINGS, body: settings },
      { method: "POST", path: RULES, status: 201, body: rule(5, "urgent", "multiplier", { factor: "1.5" }) },
      { method: "GET", path: RULES, body: [] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<QuoteRulesManager />);

    fireEvent.click(await screen.findByRole("button", { name: "افزودن قاعده" }));
    const dialog = await screen.findByRole("dialog");
    // The default kind is a base price: amount yes, factor and tier threshold no.
    expect(within(dialog).getByLabelText("مبلغ (تومان)")).toBeInTheDocument();
    expect(within(dialog).queryByLabelText("ضریب")).not.toBeInTheDocument();

    fireEvent.change(within(dialog).getByLabelText("مبلغ (تومان)"), { target: { value: "999" } });
    fireEvent.change(within(dialog).getByLabelText("نوع قاعده"), { target: { value: "multiplier" } });
    expect(within(dialog).queryByLabelText("مبلغ (تومان)")).not.toBeInTheDocument();
    fireEvent.change(within(dialog).getByLabelText("ضریب"), { target: { value: "1.5" } });
    fireEvent.change(within(dialog).getByLabelText("عنوان در سایت (فارسی)"), { target: { value: "فوری" } });
    fireEvent.change(within(dialog).getByLabelText("شناسه (انگلیسی)"), { target: { value: "urgent" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      key: "urgent",
      kind: "multiplier",
      label_fa: "فوری",
      factor: "1.5",
      amount: null, // the 999 typed before switching kind is not sent
      min_quantity: null,
      is_active: true,
    });
  });

  it("shows the server's message when a rule is refused", async () => {
    const api = fakeApi([
      { method: "GET", path: RULES, body: [] },
      { method: "GET", path: SETTINGS, body: settings },
      {
        method: "POST",
        path: RULES,
        status: 400,
        body: {
          code: "validation_error",
          detail: "کلید تکراری است.",
          fields: { key: ["این شناسه قبلاً استفاده شده."] },
        },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<QuoteRulesManager />);

    fireEvent.click(await screen.findByRole("button", { name: "افزودن قاعده" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("عنوان در سایت (فارسی)"), { target: { value: "غذا" } });
    fireEvent.change(within(dialog).getByLabelText("مبلغ (تومان)"), { target: { value: "5" } });
    fireEvent.change(within(dialog).getByLabelText("شناسه (انگلیسی)"), { target: { value: "food" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    expect(await within(dialog).findByText("این شناسه قبلاً استفاده شده.")).toBeInTheDocument();
  });

  it("saves the range settings as numbers", async () => {
    const api = fakeApi([
      { method: "GET", path: RULES, body: [] },
      { method: "GET", path: SETTINGS, body: settings },
      { method: "PATCH", path: SETTINGS, body: { ...settings, range_percent: 20 } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<QuoteRulesManager />);

    fireEvent.change(await screen.findByLabelText("درصد بازه (± درصد)"), { target: { value: "20" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی تنظیمات" }));

    expect(await screen.findByText("ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({
      range_percent: 20,
      rounding_step: 10000,
      min_quantity: 1,
      max_quantity: 200,
    });
  });

  it("previews an estimate and shows how it was built", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: RULES,
        body: [
          rule(1, "food", "service", { amount: 1_000_000 }),
          rule(2, "video", "addon_fixed", { amount: 2_000_000 }),
          rule(3, "urgent", "multiplier", { factor: "1.5" }),
        ],
      },
      { method: "GET", path: SETTINGS, body: settings },
      {
        method: "POST",
        path: `${RULES}preview/`,
        body: {
          low: 5_100_000,
          high: 6_900_000,
          currency: "toman",
          approximate: true,
          total: 6_000_000,
          base: 4_000_000,
          tier_factor: "1.000",
          addons: [["video", "2000000"]],
          multipliers: [],
        },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<QuoteRulesManager />);

    const quantity = await screen.findByLabelText("تعداد محصول");
    fireEvent.change(quantity, { target: { value: "4" } });
    fireEvent.click(screen.getByLabelText("قاعده video"));
    fireEvent.click(screen.getByRole("button", { name: "محاسبه" }));

    expect(await screen.findByLabelText("نتیجه‌ی برآورد")).toBeInTheDocument();
    expect(await screen.findByText(/^از .+ تا .+ تومان$/)).toBeInTheDocument();
    expect(screen.getByText(/افزونه «قاعده video»:/)).toBeInTheDocument();
    expect(api.calls.find((c) => c.path.endsWith("preview/"))?.body).toEqual({
      service: "food",
      quantity: 4,
      addons: ["video"],
      multipliers: [],
    });
  });
});
