import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { SampleContentManager } from "./SampleContentManager";

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

const state = (status: string, extra = {}) => ({
  status,
  message: "",
  counts: {},
  result: {},
  updated_at: "2026-10-05T10:00:00Z",
  ...extra,
});

const GET = { method: "GET", path: "/api/admin/sample-content/" };

function show(routes: Parameters<typeof fakeApi>[0]) {
  const api = fakeApi(routes);
  vi.stubGlobal("fetch", api.fetchImpl);
  renderWithQuery(<SampleContentManager />);
  return api;
}

describe("SampleContentManager", () => {
  it("offers the load when nothing is loaded and starts it after one click", async () => {
    const api = show([
      { ...GET, body: state("empty") },
      { method: "POST", path: "/api/admin/sample-content/load/", status: 202, body: state("loading") },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "بارگذاری محتوای نمونه" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("در حال بارگذاری"));
    expect(api.calls.find((c) => c.method === "POST")?.body).toEqual({ confirm: true });
    expect(screen.queryByRole("button", { name: "بارگذاری محتوای نمونه" })).toBeNull();
  });

  it("shows the counts once loaded, a link to the site and the cleanup", async () => {
    show([{ ...GET, body: state("loaded", { counts: { project: 6, article: 6 } }) }]);
    expect(await screen.findByText("نمونه‌کار:")).toBeInTheDocument();
    expect(screen.getByRole("link", { name: "دیدن سایت" })).toHaveAttribute("href", "/");
    expect(screen.getByRole("button", { name: "پاک‌کردن همه‌ی محتوای نمونه" })).toBeEnabled();
    expect(screen.queryByRole("button", { name: "بارگذاری محتوای نمونه" })).toBeNull();
  });

  it("asks before it cleans up, and does nothing when the owner says no", async () => {
    const api = show([{ ...GET, body: state("loaded") }]);
    vi.spyOn(window, "confirm").mockReturnValue(false);
    fireEvent.click(await screen.findByRole("button", { name: "پاک‌کردن همه‌ی محتوای نمونه" }));
    expect(window.confirm).toHaveBeenCalled();
    expect(api.calls.filter((c) => c.method === "POST")).toHaveLength(0);
  });

  it("cleans up after confirmation", async () => {
    show([
      { ...GET, body: state("loaded") },
      { method: "POST", path: "/api/admin/sample-content/unload/", status: 202, body: state("unloading") },
    ]);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    fireEvent.click(await screen.findByRole("button", { name: "پاک‌کردن همه‌ی محتوای نمونه" }));
    await waitFor(() => expect(screen.getByRole("status")).toHaveTextContent("در حال پاک‌سازی"));
  });

  it("says in words when a run failed and offers the cleanup", async () => {
    show([{ ...GET, body: state("failed", { message: "بارگذاری ناموفق بود." }) }]);
    expect(await screen.findByText("بارگذاری ناموفق بود.")).toBeInTheDocument();
    expect(screen.getByRole("status")).toHaveTextContent("ناموفق");
    expect(screen.getByRole("button", { name: "پاک‌کردن همه‌ی محتوای نمونه" })).toBeEnabled();
  });

  it("shows why a refused load was refused", async () => {
    show([
      { ...GET, body: state("empty") },
      {
        method: "POST",
        path: "/api/admin/sample-content/load/",
        status: 409,
        body: { code: "busy", detail: "عملیات دیگری در حال انجام است؛ کمی صبر کنید." },
      },
    ]);
    fireEvent.click(await screen.findByRole("button", { name: "بارگذاری محتوای نمونه" }));
    expect(await screen.findByText(/عملیات دیگری در حال انجام است/)).toBeInTheDocument();
  });
});
