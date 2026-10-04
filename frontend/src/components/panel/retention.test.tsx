import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { RetentionManager } from "./RetentionManager";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const settings = (extra = {}) => ({
  enabled: true,
  inquiry_months: 24,
  booking_months: 24,
  gallery_days: 90,
  proforma_months: 60,
  last_run_at: null,
  last_run: {},
  updated_at: "2026-10-04T10:00:00Z",
  ...extra,
});

const row = (key: string, label: string, count: number, oldest: string | null = null) => ({
  key,
  label,
  action: key === "galleries" ? "delete" : "anonymise",
  count,
  oldest,
});

const preview = (counts: Record<string, number>) => ({
  enabled: true,
  rows: [
    row(
      "inquiries",
      "استعلام‌ها (ناشناس‌سازی)",
      counts.inquiries ?? 0,
      counts.inquiries ? "2023-01-01T00:00:00Z" : null,
    ),
    row("bookings", "رزروها (ناشناس‌سازی)", counts.bookings ?? 0),
    row("galleries", "گالری‌های منقضی (حذف کامل)", counts.galleries ?? 0),
    row("proformas", "اطلاعات مشتری روی پیش‌فاکتورها", counts.proformas ?? 0),
  ],
});

function show(routes: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(routes);
  vi.stubGlobal("fetch", api.fetchImpl);
  renderWithQuery(<RetentionManager />);
  return api;
}

const S = { method: "GET", path: "/api/admin/retention/settings/" };
const P = { method: "GET", path: "/api/admin/retention/preview/" };

describe("RetentionManager", () => {
  it("shows the periods and what a run would remove, with the financial promise in plain words", async () => {
    show([
      { ...S, body: settings() },
      { ...P, body: preview({ inquiries: 3, galleries: 1 }) },
      { ...S, body: settings() },
    ]);
    expect(await screen.findByLabelText(/استعلام‌ها: پس از چند ماه/)).toHaveValue(24);
    expect(screen.getByLabelText(/گالری‌ها: چند روز/)).toHaveValue(90);
    expect(screen.getByLabelText(/مشتری روی پیش‌فاکتور/)).toHaveValue(60);
    expect(await screen.findByText("۳")).toBeInTheDocument(); // Persian digits
    expect(screen.getByText(/هرگز حذف نمی‌شود/)).toBeInTheDocument();
    expect(screen.getByText("هنوز اجرایی انجام نشده است.")).toBeInTheDocument();
  });

  it("saves new periods and refreshes the preview", async () => {
    const api = show([
      { ...S, body: settings() },
      { ...P, body: preview({}) },
      { ...S, body: settings() },
      {
        method: "PATCH",
        path: "/api/admin/retention/settings/",
        body: settings({ inquiry_months: 12, gallery_days: 30 }),
      },
      { ...P, body: preview({ inquiries: 5 }) },
    ]);
    const months = await screen.findByLabelText(/استعلام‌ها: پس از چند ماه/);
    fireEvent.change(months, { target: { value: "12" } });
    fireEvent.change(screen.getByLabelText(/گالری‌ها: چند روز/), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی مدت‌ها" }));
    expect(await screen.findByText("مدت‌ها ذخیره شد.")).toBeInTheDocument();
    const patch = api.calls.find((c) => c.method === "PATCH")!;
    expect(patch.body).toMatchObject({
      enabled: true,
      inquiry_months: 12,
      gallery_days: 30,
      booking_months: 24,
      proforma_months: 60,
    });
    expect(await screen.findByText("۵")).toBeInTheDocument(); // the preview was asked again
  });

  it("shows the server's refusal of a silly period", async () => {
    show([
      { ...S, body: settings() },
      { ...P, body: preview({}) },
      { ...S, body: settings() },
      {
        method: "PATCH",
        path: "/api/admin/retention/settings/",
        status: 400,
        body: { code: "invalid", detail: "ورودی نامعتبر است.", fields: { gallery_days: ["حداقل ۷"] } },
      },
    ]);
    fireEvent.change(await screen.findByLabelText(/گالری‌ها: چند روز/), { target: { value: "8" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی مدت‌ها" }));
    expect(await screen.findByRole("alert")).toBeInTheDocument();
  });

  it("warns when the policy is switched off", async () => {
    show([
      { ...S, body: settings({ enabled: false }) },
      { ...P, body: preview({}) },
      { ...S, body: settings({ enabled: false }) },
    ]);
    expect(await screen.findByText(/پاک‌سازی خاموش است/)).toBeInTheDocument();
    expect(screen.getByRole("checkbox", { name: "پاک‌سازی خودکار فعال باشد" })).not.toBeChecked();
  });

  it("does not run when nothing would be removed", async () => {
    show([
      { ...S, body: settings() },
      { ...P, body: preview({}) },
      { ...S, body: settings() },
    ]);
    await screen.findByText("هنوز اجرایی انجام نشده است.");
    expect(screen.getByRole("button", { name: "اجرا همین حالا" })).toBeDisabled();
  });

  it("asks first, listing what goes, and does nothing when declined", async () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = show([
      { ...S, body: settings() },
      { ...P, body: preview({ inquiries: 3, galleries: 1 }) },
      { ...S, body: settings() },
    ]);
    await screen.findByText("۳");
    fireEvent.click(screen.getByRole("button", { name: "اجرا همین حالا" }));
    expect(confirm).toHaveBeenCalledOnce();
    const asked = String(confirm.mock.calls[0]![0]);
    expect(asked).toContain("برگشت‌پذیر نیست");
    expect(asked).toContain("استعلام‌ها: ۳");
    expect(asked).toContain("گالری‌ها: ۱");
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });

  it("runs after confirmation and says how much it did", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const api = show([
      { ...S, body: settings() },
      { ...P, body: preview({ inquiries: 3 }) },
      {
        method: "POST",
        path: "/api/admin/retention/run/",
        body: {
          enabled: true,
          trigger: "manual",
          counts: { inquiries: 3, bookings: 0, galleries: 0, proformas: 0 },
        },
      },
      { ...S, body: settings({ last_run_at: "2026-10-04T10:00:00Z" }) },
      { ...P, body: preview({}) },
    ]);
    await screen.findByText("۳");
    fireEvent.click(screen.getByRole("button", { name: "اجرا همین حالا" }));
    expect(await screen.findByText("انجام شد: ۳ مورد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "POST")!.body).toEqual({ confirm: true });
    await waitFor(() => expect(screen.getByText(/آخرین اجرا:/)).toBeInTheDocument());
  });
});
