import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { ArticleEditorPage } from "./ArticleEditor";
import { ArticlesManager } from "./ArticlesManager";
import { BlogTaxonomyManager } from "./BlogTaxonomyManager";

const { push, replace } = vi.hoisted(() => ({ push: vi.fn(), replace: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace }) }));
// ProseMirror needs a real layout engine; the editor itself is exercised by the browser e2e.
vi.mock("./RichTextEditor", () => ({
  RichTextEditor: ({ onChange, label }: { onChange: (doc: unknown) => void; label: string }) => (
    <button
      type="button"
      onClick={() =>
        onChange({ type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "سلام" }] }] })
      }
    >
      {`نوشتن در ${label}`}
    </button>
  ),
}));

beforeEach(() => {
  push.mockClear();
  replace.mockClear();
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close ??= function (this: HTMLDialogElement) {
    this.removeAttribute("open");
  };
});
afterEach(() => vi.unstubAllGlobals());

const article = (id: number, extra = {}) => ({
  id,
  language: "fa",
  translation_group: "g1",
  slug: `a${id}`,
  title: `مقاله ${id}`,
  summary: "",
  body: { type: "doc", content: [] },
  body_media: {},
  cover: null,
  cover_detail: null,
  category: null,
  tags: [],
  status: "draft",
  published_at: null,
  seo_title: "",
  seo_description: "",
  og_image: null,
  og_image_detail: null,
  related_projects: [],
  reading_minutes: 1,
  is_live: false,
  translations: [],
  created_at: "t",
  updated_at: "t",
  ...extra,
});

const lookups = () => [
  {
    method: "GET",
    path: "/api/admin/blog/categories/",
    body: [{ id: 4, title_fa: "غذا", title_en: "Food", article_count: 1 }],
  },
  {
    method: "GET",
    path: "/api/admin/blog/tags/",
    body: [{ id: 6, title_fa: "نکته", title_en: "Tip", article_count: 0 }],
  },
  { method: "GET", path: "/api/admin/portfolio/projects/", body: [] },
];

describe("ArticlesManager", () => {
  it("lists articles with their state and filters on the server", async () => {
    const live = article(1, { status: "published", is_live: true });
    const scheduled = article(2, { status: "published", is_live: false });
    const api = fakeApi([
      { method: "GET", path: "/api/admin/blog/articles/", body: [live, scheduled, article(3)] },
      { method: "GET", path: "/api/admin/blog/articles/", body: [article(3)] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticlesManager />);

    const list = await screen.findByRole("list", { name: "مقاله‌ها" });
    const rows = within(list).getAllByRole("listitem");
    expect(rows[0]).toHaveTextContent("منتشرشده");
    expect(rows[1]).toHaveTextContent("زمان‌بندی‌شده");
    expect(rows[1]).not.toHaveTextContent("پیش‌نویس"); // one state per row, never two
    expect(rows[2]).toHaveTextContent("پیش‌نویس");

    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "draft" } });
    await waitFor(() =>
      expect(within(screen.getByRole("list", { name: "مقاله‌ها" })).getAllByRole("listitem")).toHaveLength(1),
    );
    expect(screen.getByRole("link", { name: "مقاله‌ی جدید (فارسی)" })).toHaveAttribute(
      "href",
      "/panel/articles/new?language=fa",
    );
  });

  it("opens an article for editing", async () => {
    const api = fakeApi([{ method: "GET", path: "/api/admin/blog/articles/", body: [article(7)] }]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticlesManager />);
    fireEvent.click(await screen.findByRole("button", { name: "ویرایش مقاله 7" }));
    expect(push).toHaveBeenCalledWith("/panel/articles/7");
  });
});

describe("ArticleEditorPage", () => {
  it("creates an article with the body, tags and schedule, then opens it", async () => {
    const saved = article(9, { title: "طعم قهوه" });
    const api = fakeApi([
      ...lookups(),
      { method: "POST", path: "/api/admin/blog/articles/", status: 201, body: saved },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage newLanguage="fa" />);

    fireEvent.change(await screen.findByLabelText("عنوان"), { target: { value: "طعم قهوه" } });
    fireEvent.click(screen.getByRole("button", { name: "نوشتن در متن مقاله" }));
    fireEvent.click(await screen.findByLabelText("نکته"));
    fireEvent.change(screen.getByLabelText("وضعیت"), { target: { value: "published" } });
    fireEvent.change(await screen.findByLabelText("زمان انتشار"), { target: { value: "2026-12-01T09:30" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(replace).toHaveBeenCalledWith("/panel/articles/9?created=1"));
    const body = api.calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect(body).toMatchObject({
      language: "fa",
      title: "طعم قهوه",
      status: "published",
      tags: [6],
      category: null,
      body: { type: "doc", content: [{ type: "paragraph", content: [{ type: "text", text: "سلام" }] }] },
    });
    expect(new Date(body.published_at as string).getFullYear()).toBe(2026);
  });

  it("keeps a draft without a publication date and shows the server's field errors", async () => {
    const api = fakeApi([
      ...lookups(),
      {
        method: "POST",
        path: "/api/admin/blog/articles/",
        status: 400,
        body: {
          code: "invalid",
          detail: "ورودی نامعتبر است.",
          fields: { slug: ["این نشانی قبلاً استفاده شده است."] },
        },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage newLanguage="en" />);
    fireEvent.change(await screen.findByLabelText("عنوان"), { target: { value: "Hello" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText("این نشانی قبلاً استفاده شده است.")).toBeInTheDocument();
    const body = api.calls.find((c) => c.method === "POST")?.body as Record<string, unknown>;
    expect(body).toMatchObject({ language: "en", status: "draft", published_at: null });
    expect(replace).not.toHaveBeenCalled();
  });

  it("offers the other language: makes a translation, or links to the existing one", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/blog/articles/5/", body: article(5) },
      ...lookups(),
      {
        method: "POST",
        path: "/api/admin/blog/articles/5/translate/",
        status: 201,
        body: article(6, { language: "en" }),
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "ساخت نسخه‌ی English" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/articles/6"));
  });

  it("links to an existing translation instead of offering to create one", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: "/api/admin/blog/articles/5/",
        body: article(5, { translations: [{ id: 8, language: "en", slug: "x", status: "draft" }] }),
      },
      ...lookups(),
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage id={5} />);
    expect(await screen.findByRole("link", { name: "ویرایش نسخه‌ی English" })).toHaveAttribute(
      "href",
      "/panel/articles/8",
    );
    expect(screen.queryByRole("button", { name: /ساخت نسخه/ })).not.toBeInTheDocument();
  });

  it("makes a preview link for the right language", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/blog/articles/5/", body: article(5, { language: "en" }) },
      ...lookups(),
      {
        method: "POST",
        path: "/api/admin/blog/articles/5/preview-link/",
        body: { token: "abc:def", expires_in: 86400 },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "لینک پیش‌نمایش" }));
    const input = (await screen.findByLabelText("لینک پیش‌نمایش", { selector: "input" })) as HTMLInputElement;
    expect(input.value).toMatch(/\/en\/blog\/preview\/abc:def$/);
  });

  it("reports a missing article", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: "/api/admin/blog/articles/99/",
        status: 404,
        body: { code: "not_found", detail: "x" },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ArticleEditorPage id={99} />);
    expect(await screen.findByText("مقاله پیدا نشد.")).toBeInTheDocument();
  });
});

describe("BlogTaxonomyManager", () => {
  it("adds a category and shows how many articles each one has", async () => {
    const created = { id: 9, title_fa: "قهوه", title_en: "Coffee", slug: "coffee", article_count: 0 };
    const api = fakeApi([
      {
        method: "GET",
        path: "/api/admin/blog/categories/",
        body: [{ id: 4, title_fa: "غذا", title_en: "", slug: "food", article_count: 3 }],
      },
      { method: "GET", path: "/api/admin/blog/tags/", body: [] },
      { method: "POST", path: "/api/admin/blog/categories/", status: 201, body: created },
      { method: "GET", path: "/api/admin/blog/categories/", body: [created] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<BlogTaxonomyManager />);

    const list = await screen.findByRole("list", { name: "دسته‌های مجله" });
    expect(within(list).getByText(/3 مقاله|۳ مقاله/)).toBeInTheDocument();
    expect(within(list).queryByRole("button", { name: /بالا بردن/ })).not.toBeInTheDocument(); // no manual order
    fireEvent.click(screen.getByRole("button", { name: "افزودن دسته" }));
    fireEvent.change(await screen.findByLabelText("نام دسته (فارسی)"), { target: { value: "قهوه" } });
    fireEvent.change(screen.getByLabelText("نام دسته (English)"), { target: { value: "Coffee" } });
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));
    expect(api.calls.find((c) => c.method === "POST")?.body).toMatchObject({
      title_fa: "قهوه",
      title_en: "Coffee",
      slug: "",
    });
  });
});
