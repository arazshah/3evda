import { fireEvent, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { Dashboard } from "./Dashboard";
import { currentNav, isActive, NAV_GROUPS } from "./nav";
import { PanelShell } from "./PanelShell";

let pathname = "/panel/items";
vi.mock("next/navigation", () => ({
  usePathname: () => pathname,
  useRouter: () => ({ replace: vi.fn(), push: vi.fn() }),
}));

afterEach(() => vi.unstubAllGlobals());

const me = { state: "verified", user: { username: "sevda", display_name: "سودا" } };

describe("panel menu", () => {
  it("groups the pages and marks only the current one", async () => {
    pathname = "/panel/items";
    vi.stubGlobal(
      "fetch",
      fakeApi([
        { method: "GET", path: "/api/auth/me", body: me },
        { method: "GET", path: "/api/admin/inquiries/summary/", body: { new: 3 } },
        { method: "GET", path: "/api/admin/bookings/summary/", body: { pending: 0 } },
      ]).fetchImpl,
    );
    renderWithQuery(<PanelShell>محتوا</PanelShell>);
    const nav = await screen.findByRole("navigation", { name: "منوی پنل" });
    for (const group of NAV_GROUPS) expect(within(nav).getByText(group.title)).toBeInTheDocument();
    const current = within(nav)
      .getAllByRole("link")
      .filter((l) => l.getAttribute("aria-current") === "page");
    expect(current).toHaveLength(1);
    expect(current[0]).toHaveTextContent("بخش‌های تکرارشونده");
    expect(await within(nav).findByText("۳ استعلام خوانده‌نشده")).toBeInTheDocument();
    // The strip above the content names where you are.
    expect(screen.getAllByText("محتوای سایت").length).toBeGreaterThan(1);
  });

  it("opens and closes the phone menu with a button", async () => {
    pathname = "/panel";
    vi.stubGlobal(
      "fetch",
      fakeApi([
        { method: "GET", path: "/api/auth/me", body: me },
        { method: "GET", path: "/api/admin/inquiries/summary/", body: { new: 0 } },
        { method: "GET", path: "/api/admin/bookings/summary/", body: { pending: 0 } },
      ]).fetchImpl,
    );
    renderWithQuery(<PanelShell>محتوا</PanelShell>);
    const button = await screen.findByRole("button", { name: "منو" });
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByRole("button", { name: "بستن منو" })).toHaveAttribute("aria-expanded", "true");
  });

  it("keeps booking settings apart from the bookings entry", () => {
    const bookings = NAV_GROUPS.flatMap((g) => g.items).find((i) => i.href === "/panel/booking")!;
    expect(isActive(bookings, "/panel/booking/12")).toBe(true);
    expect(isActive(bookings, "/panel/booking/settings")).toBe(false);
    expect(currentNav("/panel/booking/settings")).toEqual({ group: "تنظیمات", label: "تنظیمات رزرو" });
    expect(currentNav("/panel")).toEqual({ group: "نمای کلی", label: "داشبورد" });
  });
});

describe("Dashboard", () => {
  it("lists what needs attention and hides the system details until asked", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([
        { method: "GET", path: "/api/admin/inquiries/summary/", body: { new: 2 } },
        { method: "GET", path: "/api/admin/bookings/summary/", body: { pending: 1 } },
        { method: "GET", path: "/api/admin/blog/articles/", body: [{ id: 1 }, { id: 2 }] },
        { method: "GET", path: "/api/admin/media/", body: { count: 0, results: [] } },
        {
          method: "GET",
          path: "/api/admin/system/status",
          body: {
            level: "ok",
            checked_at: "2026-10-04T10:00:00Z",
            version: "abcdef1234567890",
            checks: [{ key: "database", label: "پایگاه‌داده", level: "ok", detail: "پاسخ می‌دهد." }],
          },
        },
      ]).fetchImpl,
    );
    renderWithQuery(<Dashboard />);
    const todo = await screen.findByRole("region", { name: "نیاز به اقدام" });
    expect(await within(todo).findByText("استعلام خوانده‌نشده")).toBeInTheDocument();
    expect(within(todo).getByText("رزرو در انتظار تأیید")).toBeInTheDocument();
    expect(within(todo).queryByText("تصویر با پردازش ناموفق")).not.toBeInTheDocument();

    expect(await screen.findByTestId("status-summary")).toBeInTheDocument();
    expect(screen.queryByText("پایگاه‌داده")).not.toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "نمایش جزئیات" }));
    expect(screen.getByText("پایگاه‌داده")).toBeInTheDocument();
  });
});
