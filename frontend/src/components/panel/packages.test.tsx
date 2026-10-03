import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { PackagesManager } from "./PackagesManager";

const { revalidatePublic } = vi.hoisted(() => ({
  revalidatePublic: vi.fn<(...tags: string[]) => Promise<boolean>>(async () => true),
}));
vi.mock("@/lib/api/revalidate", () => ({ revalidatePublic }));

beforeEach(() => {
  revalidatePublic.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

const group = (id: number, title: string, count = 0) => ({
  id,
  title_fa: title,
  title_en: "",
  description_fa: "",
  description_en: "",
  position: id,
  is_published: true,
  package_count: count,
});

const pkg = (id: number, title: string, extra = {}) => ({
  id,
  group: 1,
  title_fa: title,
  title_en: "",
  summary_fa: "",
  summary_en: "",
  price_mode: "from",
  price_amount: 2_000_000,
  price_unit_fa: "",
  price_unit_en: "",
  badge_fa: "",
  badge_en: "",
  is_featured: false,
  is_published: true,
  position: id,
  features: [],
  ...extra,
});

describe("PackagesManager", () => {
  it("creates a package with a starting price and an excluded feature", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/pricing/groups/", body: [group(1, "غذا")] },
      { method: "GET", path: "/api/admin/pricing/packages/", body: [] },
      { method: "POST", path: "/api/admin/pricing/packages/", status: 201, body: pkg(7, "پایه") },
      { method: "GET", path: "/api/admin/pricing/packages/", body: [pkg(7, "پایه")] },
      { method: "GET", path: "/api/admin/pricing/groups/", body: [group(1, "غذا", 1)] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<PackagesManager />);

    fireEvent.click(await screen.findByRole("button", { name: "افزودن پکیج" }));
    fireEvent.change(await screen.findByLabelText("نام پکیج (فارسی)"), { target: { value: "پایه" } });
    fireEvent.change(screen.getByLabelText("مبلغ (تومان)"), { target: { value: "2000000" } });
    fireEvent.click(screen.getByRole("button", { name: "افزودن ویژگی" }));
    fireEvent.change(screen.getByLabelText("ویژگی 1 (فارسی)"), { target: { value: "ویدیو" } });
    fireEvent.click(screen.getByLabelText("شامل می‌شود"));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(revalidatePublic).toHaveBeenCalledWith("packages"));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      group: 1,
      title_fa: "پایه",
      price_mode: "from",
      price_amount: 2000000,
      features: [{ text_fa: "ویدیو", text_en: "", included: false }],
    });
  });

  it("hides the amount and sends no price for a quote-only package", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/pricing/groups/", body: [group(1, "غذا", 1)] },
      { method: "GET", path: "/api/admin/pricing/packages/", body: [pkg(7, "پایه")] },
      { method: "PATCH", path: "/api/admin/pricing/packages/7/", body: pkg(7, "پایه") },
      { method: "GET", path: "/api/admin/pricing/packages/", body: [pkg(7, "پایه")] },
      { method: "GET", path: "/api/admin/pricing/groups/", body: [group(1, "غذا", 1)] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<PackagesManager />);

    fireEvent.click(await screen.findByRole("button", { name: "ویرایش پایه" }));
    const dialog = await screen.findByRole("dialog");
    fireEvent.change(within(dialog).getByLabelText("نوع قیمت"), { target: { value: "inquiry" } });
    expect(within(dialog).queryByLabelText("مبلغ (تومان)")).not.toBeInTheDocument();
    fireEvent.click(within(dialog).getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toMatchObject({
      price_mode: "inquiry",
      price_amount: null,
    });
  });

  it("shows the starting price in the list and sends the new order of packages", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/pricing/groups/", body: [group(1, "غذا", 2)] },
      {
        method: "GET",
        path: "/api/admin/pricing/packages/",
        body: [pkg(7, "الف"), pkg(8, "ب", { price_mode: "inquiry", price_amount: null })],
      },
      { method: "POST", path: "/api/admin/pricing/packages/reorder/", body: {} },
      { method: "GET", path: "/api/admin/pricing/packages/", body: [pkg(8, "ب"), pkg(7, "الف")] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<PackagesManager />);

    const list = await screen.findByRole("list", { name: "پکیج‌ها" });
    expect(within(list).getByText(/^از .+ تومان$/)).toBeInTheDocument();
    expect(within(list).getByText("استعلام قیمت")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "پایین بردن الف" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/reorder/"))).toBe(true));
    expect(api.calls.find((c) => c.path.endsWith("/reorder/"))?.body).toEqual({ ids: [8, 7] });
  });
});
