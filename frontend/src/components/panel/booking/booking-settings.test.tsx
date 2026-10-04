import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { BookingSettingsManager } from "./BookingSettingsManager";

beforeEach(() => {
  vi.spyOn(window, "confirm").mockReturnValue(true);
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

const B = "/api/admin/booking";
const type = (id: number, extra = {}) => ({
  id,
  key: `t${id}`,
  title_fa: `جلسه ${id}`,
  title_en: "",
  duration_minutes: 90,
  buffer_minutes: 30,
  is_active: true,
  position: id,
  ...extra,
});
const settings = {
  max_per_day: 3,
  min_notice_hours: 24,
  horizon_days: 60,
  updated_at: "2026-10-03T10:00:00Z",
};

function loads(
  extra: Parameters<typeof fakeApi>[0] = [],
  hours = [{ weekday: 5, start: "10:00:00", end: "18:00:00" }],
  closed: unknown[] = [],
) {
  return fakeApi([
    { method: "GET", path: `${B}/session-types/`, body: [type(1), type(2, { is_active: false })] },
    { method: "GET", path: `${B}/hours/`, body: { hours } },
    { method: "GET", path: `${B}/closed/`, body: closed },
    { method: "GET", path: `${B}/settings/`, body: settings },
    ...extra,
  ]);
}

describe("BookingSettingsManager", () => {
  it("lists the session types with their length and state", async () => {
    vi.stubGlobal("fetch", loads().fetchImpl);
    renderWithQuery(<BookingSettingsManager />);
    const list = await screen.findByRole("list", { name: "انواع جلسه" });
    const items = within(list).getAllByRole("listitem");
    expect(items).toHaveLength(2);
    expect(within(items[0]!).getByText(/۹۰ دقیقه \+ ۳۰ دقیقه فاصله/)).toBeInTheDocument();
    expect(within(items[1]!).getByText("غیرفعال")).toBeInTheDocument();
  });

  it("creates a session type from the dialog and shows the server's complaint when refused", async () => {
    const api = loads([
      {
        method: "POST",
        path: `${B}/session-types/`,
        status: 400,
        body: { code: "invalid", detail: "کلید نامعتبر است." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingSettingsManager />);
    await screen.findByRole("list", { name: "انواع جلسه" });
    fireEvent.click(screen.getByRole("button", { name: "افزودن نوع جلسه" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("عنوان در سایت (فارسی)"), { target: { value: "جدید" } });
    fireEvent.change(within(dialog).getByLabelText("کلید"), { target: { value: "new-one" } });
    fireEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));
    expect(await within(dialog).findByRole("alert")).toHaveTextContent("کلید نامعتبر است.");
    expect(api.calls.find((c) => c.method === "POST")!.body).toMatchObject({
      key: "new-one",
      title_fa: "جدید",
      duration_minutes: 60,
      buffer_minutes: 0,
      is_active: true,
    });
  });

  it("shows each weekday, with «closed» where there are no hours, and saves the whole week", async () => {
    const api = loads([{ method: "PUT", path: `${B}/hours/`, body: { hours: [] } }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingSettingsManager />);
    expect(await screen.findByLabelText("از (شنبه)")).toHaveValue("10:00");
    expect(screen.getAllByText("تعطیل")).toHaveLength(6);

    fireEvent.click(screen.getByRole("button", { name: "افزودن بازه برای جمعه" }));
    fireEvent.change(screen.getByLabelText("از (جمعه)"), { target: { value: "09:00" } });
    fireEvent.click(screen.getByRole("button", { name: "حذف بازه‌ی شنبه" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی ساعت کاری" }));

    expect(await screen.findByText("ساعت کاری ذخیره شد.")).toBeInTheDocument();
    expect(api.calls.find((c) => c.method === "PUT")!.body).toEqual({
      hours: [{ weekday: 4, start: "09:00", end: "18:00" }],
    });
  });

  it("adds a closed period from the Jalali selects and lists it", async () => {
    const api = loads(
      [
        {
          method: "POST",
          path: `${B}/closed/`,
          status: 201,
          body: { id: 1, start_date: "2026-12-01", end_date: "2026-12-03", reason: "سفر" },
        },
      ],
      [],
      [{ id: 9, start_date: "2026-11-01", end_date: "2026-11-01", reason: "تعطیل" }],
    );
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingSettingsManager />);
    const list = await screen.findByRole("list", { name: "روزهای بسته" });
    expect(within(list).getByText(/تعطیل/)).toBeInTheDocument();

    fireEvent.change(screen.getByLabelText("از تاریخ — سال"), { target: { value: "1405" } });
    fireEvent.change(screen.getByLabelText("از تاریخ — ماه"), { target: { value: "9" } });
    fireEvent.change(screen.getByLabelText("از تاریخ — روز"), { target: { value: "10" } });
    fireEvent.change(screen.getByLabelText("دلیل (فقط برای خودتان)"), { target: { value: "سفر" } });
    fireEvent.click(screen.getByRole("button", { name: "افزودن" }));

    await screen.findByText("روز بسته اضافه شد.");
    const body = api.calls.find((c) => c.method === "POST")!.body as {
      start_date: string;
      end_date: string;
      reason: string;
    };
    expect(body.start_date).toBe("2026-12-01"); // 10 Azar 1405
    expect(body.end_date >= body.start_date).toBe(true); // the end moved along with the start
    expect(body.reason).toBe("سفر");
  });

  it("saves the limits", async () => {
    const api = loads([{ method: "PATCH", path: `${B}/settings/`, body: { ...settings, max_per_day: 5 } }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BookingSettingsManager />);
    const input = await screen.findByLabelText("حداکثر رزرو در یک روز");
    fireEvent.change(input, { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره‌ی سقف‌ها" }));
    await waitFor(() => expect(screen.getByText("سقف‌ها ذخیره شد.")).toBeInTheDocument());
    expect(api.calls.find((c) => c.method === "PATCH")!.body).toEqual({
      max_per_day: 5,
      min_notice_hours: 24,
      horizon_days: 60,
    });
  });
});
