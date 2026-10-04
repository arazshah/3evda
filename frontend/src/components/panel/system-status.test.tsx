import { screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { SystemStatusCard } from "./SystemStatusCard";

afterEach(() => vi.unstubAllGlobals());

const check = (key: string, label: string, level: string, detail: string) => ({ key, label, level, detail });

const body = (level: string, checks: ReturnType<typeof check>[]) => ({
  level,
  checked_at: "2026-10-04T10:00:00Z",
  version: "abcdef1234567890",
  checks,
});

function show(response: unknown, status = 200) {
  const api = fakeApi([{ method: "GET", path: "/api/admin/system/status", status, body: response }]);
  vi.stubGlobal("fetch", api.fetchImpl);
  return renderWithQuery(<SystemStatusCard />);
}

describe("SystemStatusCard", () => {
  it("says everything is normal, with each check written out", async () => {
    show(
      body("ok", [
        check("database", "پایگاه‌داده", "ok", "پاسخ می‌دهد."),
        check("backup", "آخرین پشتیبان", "ok", "آخرین پشتیبان سالم 3 ساعت پیش گرفته شد."),
      ]),
    );
    const summary = await screen.findByTestId("status-summary");
    expect(summary).toHaveTextContent("سالم");
    expect(summary).toHaveTextContent("همه‌چیز عادی است.");
    expect(screen.getByText("پایگاه‌داده")).toBeInTheDocument();
    expect(screen.getByText("آخرین پشتیبان سالم ۳ ساعت پیش گرفته شد.")).toBeInTheDocument(); // Persian digits
    expect(screen.getByText(/نسخه‌ی سایت: abcdef1/)).toBeInTheDocument();
  });

  it("shows a stale backup as an error in words, not only in colour", async () => {
    show(
      body("error", [
        check(
          "backup",
          "آخرین پشتیبان",
          "error",
          "آخرین پشتیبان سالم 30 ساعت پیش گرفته شده است؛ بیش از ۲۶ ساعت.",
        ),
        check("redis", "Redis", "ok", "پاسخ می‌دهد."),
      ]),
    );
    const summary = await screen.findByTestId("status-summary");
    expect(summary).toHaveTextContent("خطا");
    expect(summary).toHaveTextContent("مشکلی هست که باید بررسی شود.");
    const row = screen.getByText("آخرین پشتیبان").closest("li")!;
    expect(within(row).getByText("خطا")).toBeInTheDocument();
    expect(within(row).getByText(/۳۰ ساعت پیش/)).toBeInTheDocument();
  });

  it("shows warnings and 'unknown' differently from errors", async () => {
    show(
      body("warning", [
        check("queue", "صف کارها", "warning", "قدیمی‌ترین کار 20 دقیقه است که منتظر مانده."),
        check("storage_disk", "فضای آزاد ذخیره‌سازی", "unknown", "اندازه‌گیری نشد."),
      ]),
    );
    await screen.findByTestId("status-summary");
    expect(screen.getAllByText("هشدار")).toHaveLength(2); // the summary and the row
    expect(screen.getByText("نامشخص")).toBeInTheDocument();
    expect(screen.queryByText("خطا")).not.toBeInTheDocument();
  });

  it("says so when the status cannot be read at all", async () => {
    show({ code: "error", detail: "x" }, 500);
    expect(await screen.findByRole("status")).toHaveTextContent("وضعیت سیستم خوانده نشد");
  });

  it("checks again on request", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: "/api/admin/system/status",
        body: body("ok", [check("database", "پایگاه‌داده", "ok", "ok")]),
      },
      {
        method: "GET",
        path: "/api/admin/system/status",
        body: body("error", [check("database", "پایگاه‌داده", "error", "در دسترس نیست.")]),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<SystemStatusCard />);
    await screen.findByText("همه‌چیز عادی است.");
    screen.getByRole("button", { name: "بررسی دوباره" }).click();
    await waitFor(() => expect(screen.getByTestId("status-summary")).toHaveTextContent("خطا"));
    expect(api.calls).toHaveLength(2);
  });
});
