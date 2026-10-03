import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { CategoriesManager } from "./CategoriesManager";
import { ItemsManager } from "./ItemsManager";
import { ProjectsManager } from "./ProjectsManager";

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

const item = (id: number, title: string, extra = {}) => ({
  id,
  collection: "service",
  position: id,
  is_published: true,
  title_fa: title,
  title_en: "",
  subtitle_fa: "",
  subtitle_en: "",
  body_fa: "",
  body_en: "",
  link_url: "",
  media: null,
  media_detail: null,
  ...extra,
});

describe("ItemsManager", () => {
  it("adds an item to the chosen collection and refreshes the site", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/items/", body: [] },
      { method: "POST", path: "/api/admin/cms/items/", status: 201, body: item(1, "عکاسی غذا") },
      { method: "GET", path: "/api/admin/cms/items/", body: [item(1, "عکاسی غذا")] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ItemsManager />);

    fireEvent.click(await screen.findByRole("button", { name: "خدمات" }));
    fireEvent.click(await screen.findByRole("button", { name: "افزودن خدمت" }));
    fireEvent.change(await screen.findByLabelText("نام خدمت (فارسی)"), { target: { value: "عکاسی غذا" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    expect(await screen.findByText("عکاسی غذا", { selector: "p" })).toBeInTheDocument();
    const post = api.calls.find((c) => c.method === "POST");
    expect(post?.body).toMatchObject({ collection: "service", title_fa: "عکاسی غذا", is_published: true });
    // Only the fields this collection uses are sent.
    expect(post?.body).not.toHaveProperty("link_url");
    expect(revalidatePublic).toHaveBeenCalledWith("site");
  });

  it("sends the complete new order when a row moves down", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/items/", body: [item(1, "الف"), item(2, "ب"), item(3, "ج")] },
      { method: "POST", path: "/api/admin/cms/items/reorder/", body: {} },
      { method: "GET", path: "/api/admin/cms/items/", body: [item(2, "ب"), item(1, "الف"), item(3, "ج")] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ItemsManager />);

    fireEvent.click(await screen.findByRole("button", { name: "پایین بردن الف" }));
    await waitFor(() => expect(api.calls.some((c) => c.path.endsWith("/reorder/"))).toBe(true));
    expect(api.calls.find((c) => c.path.endsWith("/reorder/"))?.body).toEqual({
      collection: "hero_slide",
      ids: [2, 1, 3],
    });
    const rows = within(await screen.findByRole("list", { name: "اسلایدهای صفحه‌ی اول" })).getAllByRole(
      "listitem",
    );
    await waitFor(() => expect(rows[0]).toHaveTextContent("ب"));
  });

  it("deletes after confirmation only", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/items/", body: [item(1, "الف")] },
      { method: "DELETE", path: "/api/admin/cms/items/1/", status: 204 },
      { method: "GET", path: "/api/admin/cms/items/", body: [] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const confirm = vi.spyOn(window, "confirm").mockReturnValueOnce(false).mockReturnValueOnce(true);
    renderWithQuery(<ItemsManager />);

    const del = await screen.findByRole("button", { name: "حذف الف" });
    fireEvent.click(del);
    expect(api.calls.some((c) => c.method === "DELETE")).toBe(false);
    fireEvent.click(del);
    await waitFor(() => expect(api.calls.some((c) => c.method === "DELETE")).toBe(true));
    confirm.mockRestore();
  });
});

describe("CategoriesManager", () => {
  const category = {
    id: 5,
    slug: "food",
    title_fa: "غذا",
    title_en: "Food",
    description_fa: "",
    description_en: "",
    cover: null,
    cover_detail: null,
    position: 1,
    is_published: true,
    project_count: 2,
  };

  it("shows the server's message when a category still has projects", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/portfolio/categories/", body: [category] },
      {
        method: "DELETE",
        path: "/api/admin/portfolio/categories/5/",
        status: 409,
        body: { code: "in_use", detail: "این دسته پروژه دارد." },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    renderWithQuery(<CategoriesManager />);

    expect(await screen.findByText("2 پروژه")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "حذف غذا" }));
    expect(await screen.findByText("این دسته پروژه دارد.")).toBeInTheDocument();
    expect(revalidatePublic).not.toHaveBeenCalled();
  });
});

describe("ProjectsManager", () => {
  const variant = {
    name: "w480",
    format: "webp",
    url: "/media/a.webp",
    width: 480,
    height: 480,
    size_bytes: 1,
  };
  const asset = {
    id: "11111111-1111-1111-1111-111111111111",
    kind: "image",
    status: "ready",
    original_filename: "plate.jpg",
    title: "Plate",
    alt_fa: "",
    alt_en: "",
    lqip: "",
    variants: [variant],
  };

  it("creates a project with a gallery in the chosen order", async () => {
    const created = { id: 9, title_fa: "کافه", is_published: true, position: 1, images: [] };
    const api = fakeApi([
      { method: "GET", path: "/api/admin/portfolio/projects/", body: [] },
      {
        method: "GET",
        path: "/api/admin/portfolio/categories/",
        body: [{ id: 5, title_fa: "غذا", title_en: "Food" }],
      },
      { method: "GET", path: "/api/admin/media/", body: { count: 1, results: [asset] } },
      { method: "POST", path: "/api/admin/portfolio/projects/", status: 201, body: created },
      { method: "GET", path: "/api/admin/portfolio/projects/", body: [created] },
      { method: "GET", path: "/api/admin/portfolio/categories/", body: [] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ProjectsManager />);

    fireEvent.click(await screen.findByRole("button", { name: "افزودن پروژه" }));
    fireEvent.change(await screen.findByLabelText("عنوان (فارسی)"), { target: { value: "کافه" } });
    fireEvent.change(await screen.findByLabelText("دسته"), { target: { value: "5" } });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب افزودن تصویر یا ویدیو" }));
    fireEvent.click(await screen.findByRole("button", { name: "Plate" }));
    fireEvent.change(await screen.findByLabelText("توضیح تصویر 1 (فارسی)"), { target: { value: "فنجان" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      title_fa: "کافه",
      category: 5,
      images: [{ media: asset.id, caption_fa: "فنجان", caption_en: "" }],
      is_featured: false,
      is_published: true,
    });
    await waitFor(() => expect(revalidatePublic).toHaveBeenCalledWith("portfolio"));
  });
});
