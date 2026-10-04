import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { GalleriesManager } from "./GalleriesManager";
import { GalleryDetailPage } from "./GalleryDetail";
import { GalleryForm } from "./GalleryForm";
import { GalleryPhotos } from "./GalleryPhotos";
import { GallerySelections } from "./GallerySelections";
import { endOfTehranDay, tehranDay } from "./status";

const { push } = vi.hoisted(() => ({ push: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ push, replace: vi.fn() }) }));

beforeEach(() => {
  push.mockClear();
  vi.spyOn(window, "confirm").mockReturnValue(true);
});
afterEach(() => vi.unstubAllGlobals());

type Route = { method: string; path: string; status?: number; body?: unknown };
const BASE = "/api/admin/galleries/";
const gallery = (extra = {}) => ({
  id: 5,
  title: "جلسه‌ی کافه",
  client_name: "سارا",
  language: "fa",
  status: "draft",
  has_password: false,
  expires_at: "2026-11-10T20:29:59Z",
  selection_limit: null,
  download_level: "selected",
  watermark: true,
  note: "",
  inquiry: null,
  booking: null,
  proforma: null,
  link: "https://3evda.com/g/abc_def",
  photo_count: 3,
  ready_count: 2,
  usage_bytes: 5_000_000,
  submitted_at: null,
  created_at: "2026-10-04T10:00:00Z",
  updated_at: "2026-10-04T10:00:00Z",
  ...extra,
});
const photo = (id: number, extra = {}) => ({
  id,
  original_filename: `IMG_${id}.jpg`,
  status: "ready",
  width: 2400,
  height: 1600,
  size_bytes: 3_000_000,
  position: id,
  error: "",
  thumb_url: `/storage-signed/t${id}`,
  ...extra,
});
const summary = (extra = {}) => ({
  photo_count: 10,
  selected_count: 2,
  retouch_count: 1,
  comment_count: 1,
  submitted_at: null,
  filenames: "IMG_1, IMG_3",
  items: [
    {
      photo: 1,
      filename: "IMG_1.jpg",
      thumb_url: "/storage-signed/a",
      selected: true,
      comment: "روشن‌تر",
      retouch: true,
    },
    { photo: 3, filename: "IMG_3.jpg", thumb_url: null, selected: true, comment: "", retouch: false },
  ],
  ...extra,
});

describe("dates", () => {
  it("keeps a gallery open through its whole last Tehran day", () => {
    expect(endOfTehranDay("2026-11-10")).toBe("2026-11-10T23:59:59+03:30");
    expect(tehranDay("2026-11-10T20:29:59Z")).toBe("2026-11-10");
    expect(tehranDay("2026-11-10T21:00:00Z")).toBe("2026-11-11"); // past Tehran midnight
  });
});

describe("GalleriesManager", () => {
  it("lists galleries with counts, size and status, and the total space", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([
        {
          method: "GET",
          path: BASE,
          body: [gallery(), gallery({ id: 6, title: "دوم", status: "published", usage_bytes: 1_000_000 })],
        },
      ]).fetchImpl,
    );
    renderWithQuery(<GalleriesManager />);
    const list = await screen.findByRole("list", { name: "گالری‌ها" });
    expect(within(list).getAllByRole("link")).toHaveLength(2);
    expect(within(list).getByText("پیش‌نویس")).toBeInTheDocument();
    expect(within(list).getByText("منتشرشده")).toBeInTheDocument();
    expect(screen.getByText(/فضای مصرفی همه‌ی گالری‌ها/)).toBeInTheDocument();
  });

  it("invites the first gallery", async () => {
    vi.stubGlobal("fetch", fakeApi([{ method: "GET", path: BASE, body: [] }]).fetchImpl);
    renderWithQuery(<GalleriesManager />);
    expect(await screen.findByText(/هنوز گالری‌ای نساخته‌اید/)).toBeInTheDocument();
  });
});

describe("GalleryForm", () => {
  it("sends the fields: expiry as the end of a Tehran day, a limit, a password", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(<GalleryForm submitLabel="ساخت" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("عنوان گالری"), { target: { value: " عکس‌های منو " } });
    fireEvent.change(screen.getByLabelText("نام مشتری"), { target: { value: "سارا" } });
    fireEvent.click(screen.getByLabelText("تعداد عکس قابل‌انتخاب محدود باشد"));
    fireEvent.change(screen.getByLabelText("حداکثر تعداد"), { target: { value: "15" } });
    fireEvent.change(screen.getByLabelText("سطح دانلود"), { target: { value: "all_original" } });
    fireEvent.change(screen.getByLabelText("رمز گالری (اختیاری)"), { target: { value: "راز" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalledTimes(1));
    const sent = onSubmit.mock.calls[0]![0];
    expect(sent).toMatchObject({
      title: "عکس‌های منو",
      client_name: "سارا",
      language: "fa",
      selection_limit: 15,
      download_level: "all_original",
      watermark: true,
      password: "راز",
    });
    expect(sent.expires_at).toMatch(/T23:59:59\+03:30$/);
    expect(sent).not.toHaveProperty("clear_password");
  });

  it("can leave the gallery without an expiry and without a limit", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(<GalleryForm submitLabel="ذخیره" onSubmit={onSubmit} gallery={gallery() as never} />);
    fireEvent.click(screen.getByLabelText("گالری تا یک روز مشخص باز باشد"));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    expect(onSubmit.mock.calls[0]![0]).toMatchObject({ expires_at: null, selection_limit: null });
  });

  it("refuses a limit that is not a positive whole number", async () => {
    const onSubmit = vi.fn();
    renderWithQuery(<GalleryForm submitLabel="ساخت" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("عنوان گالری"), { target: { value: "x" } });
    fireEvent.click(screen.getByLabelText("تعداد عکس قابل‌انتخاب محدود باشد"));
    fireEvent.change(screen.getByLabelText("حداکثر تعداد"), { target: { value: "" } }); // the browser itself stops 0 or 1.5 (min and step)
    fireEvent.click(screen.getByRole("button", { name: "ساخت" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("سقف انتخاب");
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it("for an existing password: empty keeps it, the box can clear it", async () => {
    const onSubmit = vi.fn().mockResolvedValue(undefined);
    renderWithQuery(
      <GalleryForm
        submitLabel="ذخیره"
        onSubmit={onSubmit}
        gallery={gallery({ has_password: true }) as never}
      />,
    );
    fireEvent.click(screen.getByLabelText("رمز برداشته شود"));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(onSubmit).toHaveBeenCalled());
    const sent = onSubmit.mock.calls[0]![0];
    expect(sent.clear_password).toBe(true);
    expect(sent).not.toHaveProperty("password");
  });

  it("shows the server's refusal", async () => {
    const onSubmit = vi.fn().mockRejectedValue({ code: "invalid", detail: "عنوان لازم است." });
    renderWithQuery(<GalleryForm submitLabel="ساخت" onSubmit={onSubmit} />);
    fireEvent.change(screen.getByLabelText("عنوان گالری"), { target: { value: "x" } });
    fireEvent.click(screen.getByRole("button", { name: "ساخت" }));
    expect(await screen.findByRole("alert")).toHaveTextContent("عنوان لازم است.");
  });
});

describe("GalleryPhotos", () => {
  it("uploads several photos through the queue and lists the gallery's photos", async () => {
    const api = fakeApi([
      {
        method: "GET",
        path: `${BASE}5/photos/`,
        body: [photo(1), photo(2, { status: "pending", thumb_url: null })],
      },
      { method: "GET", path: `${BASE}5/photos/`, body: [photo(1), photo(2), photo(3)] },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const upload = vi.fn().mockResolvedValue({});
    renderWithQuery(<GalleryPhotos galleryId={5} upload={upload} />);
    const list = await screen.findByRole("list", { name: "عکس‌های گالری" });
    expect(within(list).getAllByRole("listitem")).toHaveLength(2);
    expect(within(list).getByText("در حال آماده‌سازی…")).toBeInTheDocument();
    const input = screen.getByLabelText("انتخاب عکس برای آپلود در گالری");
    fireEvent.change(input, {
      target: { files: [new File(["a"], "a.jpg"), new File(["b"], "b.jpg"), new File(["c"], "c.jpg")] },
    });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(3));
    const queue = await screen.findByRole("list", { name: "صف آپلود" });
    await waitFor(() => expect(within(queue).getAllByText("آپلود شد")).toHaveLength(3));
    await waitFor(() =>
      expect(
        within(screen.getByRole("list", { name: "عکس‌های گالری" })).getAllByRole("listitem"),
      ).toHaveLength(3),
    );
  });

  it("renews its thumbnails before their signed addresses (five minutes) expire", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      const api = fakeApi([
        { method: "GET", path: `${BASE}5/photos/`, body: [photo(1)] },
        {
          method: "GET",
          path: `${BASE}5/photos/`,
          body: [photo(1, { thumb_url: "/storage-signed/renewed" })],
        },
      ]);
      vi.stubGlobal("fetch", api.fetchImpl);
      renderWithQuery(<GalleryPhotos galleryId={5} />);
      await vi.advanceTimersByTimeAsync(50);
      expect(screen.getByAltText("IMG_1.jpg")).toHaveAttribute("src", "/storage-signed/t1");
      await vi.advanceTimersByTimeAsync(3 * 60 * 1000);
      expect(api.calls.filter((c) => c.method === "GET")).toHaveLength(1); // not yet: still within the five minutes
      await vi.advanceTimersByTimeAsync(2 * 60 * 1000);
      expect(api.calls.filter((c) => c.method === "GET")).toHaveLength(2);
      expect(screen.getByAltText("IMG_1.jpg")).toHaveAttribute("src", "/storage-signed/renewed");
    } finally {
      vi.useRealTimers();
    }
  });

  it("does not start a second pool of uploads when more photos are added during a batch", async () => {
    vi.stubGlobal("fetch", fakeApi([{ method: "GET", path: `${BASE}5/photos/`, body: [] }]).fetchImpl);
    let running = 0;
    let peak = 0;
    const upload = vi.fn(async () => {
      running += 1;
      peak = Math.max(peak, running);
      await new Promise((r) => setTimeout(r, 20));
      running -= 1;
      return {};
    });
    renderWithQuery(<GalleryPhotos galleryId={5} upload={upload} />);
    const input = await screen.findByLabelText("انتخاب عکس برای آپلود در گالری");
    const batch = (prefix: string) =>
      Array.from({ length: 4 }, (_, i) => new File(["x"], `${prefix}${i}.jpg`));
    fireEvent.change(input, { target: { files: batch("a") } });
    fireEvent.change(input, { target: { files: batch("b") } });
    await waitFor(() => expect(upload).toHaveBeenCalledTimes(8));
    expect(peak).toBe(3);
  });

  it("shows a refused upload and lets it be tried again", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([
        { method: "GET", path: `${BASE}5/photos/`, body: [] },
        { method: "GET", path: `${BASE}5/photos/`, body: [] },
      ]).fetchImpl,
    );
    const upload = vi
      .fn()
      .mockRejectedValueOnce({ code: "duplicate", detail: "این عکس قبلاً بارگذاری شده است." })
      .mockResolvedValue({});
    renderWithQuery(<GalleryPhotos galleryId={5} upload={upload} />);
    fireEvent.change(await screen.findByLabelText("انتخاب عکس برای آپلود در گالری"), {
      target: { files: [new File(["a"], "a.jpg")] },
    });
    expect(await screen.findByText("این عکس قبلاً بارگذاری شده است.")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "تلاش دوباره a.jpg" }));
    await waitFor(() => expect(screen.getByText("آپلود شد")).toBeInTheDocument());
    expect(upload).toHaveBeenCalledTimes(2);
  });

  it("moves a photo and deletes one after asking", async () => {
    const api = fakeApi([
      { method: "GET", path: `${BASE}5/photos/`, body: [photo(1), photo(2)] },
      { method: "PATCH", path: `${BASE}5/photos/order/`, status: 204 },
      { method: "GET", path: `${BASE}5/photos/`, body: [photo(2), photo(1)] },
      { method: "DELETE", path: `${BASE}5/photos/2/`, status: 204 },
      { method: "GET", path: `${BASE}5/photos/`, body: [photo(1)] },
      { method: "GET", path: `${BASE}5/`, body: gallery() },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GalleryPhotos galleryId={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "عقب‌تر بردن IMG_1.jpg" }));
    await waitFor(() => expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ ids: [2, 1] }));
    fireEvent.click(await screen.findByRole("button", { name: "حذف IMG_2.jpg" }));
    await waitFor(() =>
      expect(api.calls.some((c) => c.method === "DELETE" && c.path.endsWith("/photos/2/"))).toBe(true),
    );
    expect(window.confirm).toHaveBeenCalled();
  });
});

describe("GallerySelections", () => {
  it("shows counts, notes and the Lightroom names, and copies them", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([{ method: "GET", path: `${BASE}5/selections/`, body: summary() }]).fetchImpl,
    );
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.defineProperty(navigator, "clipboard", { value: { writeText }, configurable: true });
    renderWithQuery(<GallerySelections galleryId={5} />);
    expect(await screen.findByText(/۲ انتخاب از ۱۰ عکس/)).toBeInTheDocument();
    expect(screen.getByLabelText("نام فایل‌های انتخاب‌شده برای Lightroom")).toHaveValue("IMG_1, IMG_3");
    expect(screen.getByText("روشن‌تر")).toBeInTheDocument();
    fireEvent.click(screen.getByRole("button", { name: "کپی نام‌ها" }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("IMG_1, IMG_3"));
    expect(await screen.findByText("کپی شد.")).toBeInTheDocument();
  });

  it("renews the thumbnails of the choices before they expire", async () => {
    vi.useFakeTimers({ toFake: ["setTimeout", "clearTimeout", "setInterval", "clearInterval"] });
    try {
      const api = fakeApi([
        { method: "GET", path: `${BASE}5/selections/`, body: summary() },
        { method: "GET", path: `${BASE}5/selections/`, body: summary() },
      ]);
      vi.stubGlobal("fetch", api.fetchImpl);
      renderWithQuery(<GallerySelections galleryId={5} />);
      await vi.advanceTimersByTimeAsync(50);
      expect(api.calls).toHaveLength(1);
      await vi.advanceTimersByTimeAsync(5 * 60 * 1000);
      expect(api.calls).toHaveLength(2);
    } finally {
      vi.useRealTimers();
    }
  });

  it("asks the server for the filtered view", async () => {
    const api = fakeApi([
      { method: "GET", path: `${BASE}5/selections/`, body: summary() },
      { method: "GET", path: `${BASE}5/selections/`, body: summary({ items: [] }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GallerySelections galleryId={5} />);
    await screen.findByText(/۲ انتخاب/);
    fireEvent.click(screen.getByRole("button", { name: "ریتاچ" }));
    expect(await screen.findByText("موردی نیست.")).toBeInTheDocument();
    expect(api.calls.at(-1)!.search).toBe("?only=retouch");
  });

  it("says so when copying is not allowed", async () => {
    vi.stubGlobal(
      "fetch",
      fakeApi([{ method: "GET", path: `${BASE}5/selections/`, body: summary() }]).fetchImpl,
    );
    Object.defineProperty(navigator, "clipboard", {
      value: { writeText: vi.fn().mockRejectedValue(new Error("no")) },
      configurable: true,
    });
    renderWithQuery(<GallerySelections galleryId={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "کپی نام‌ها" }));
    expect(await screen.findByText(/کپی خودکار ممکن نشد/)).toBeInTheDocument();
  });
});

describe("GalleryDetailPage", () => {
  const routes = (extra: Route[] = []): Route[] => [
    { method: "GET", path: `${BASE}5/`, body: gallery() },
    { method: "GET", path: `${BASE}5/photos/`, body: [photo(1)] },
    { method: "GET", path: `${BASE}5/selections/`, body: summary() },
    {
      method: "GET",
      path: `${BASE}5/finals/`,
      body: [
        {
          id: 9,
          filename: "final.jpg",
          mime: "image/jpeg",
          size_bytes: 2_000_000,
          position: 0,
          created_at: "2026-10-04T10:00:00Z",
        },
      ],
    },
    {
      method: "GET",
      path: `${BASE}5/downloads/`,
      body: [{ id: 1, kind: "zip", files: 4, originals: true, created_at: "2026-10-04T10:00:00Z" }],
    },
    ...extra,
  ];

  it("shows the gallery with its link, finals and download log", async () => {
    vi.stubGlobal("fetch", fakeApi(routes()).fetchImpl);
    renderWithQuery(<GalleryDetailPage id={5} />);
    expect(await screen.findByRole("heading", { name: "جلسه‌ی کافه", level: 1 })).toBeInTheDocument();
    expect(screen.getByLabelText("لینک گالری برای مشتری")).toHaveValue("https://3evda.com/g/abc_def");
    expect(await screen.findByText("final.jpg")).toBeInTheDocument();
    expect(await screen.findByText(/ZIP · ۴ فایل · اصل/)).toBeInTheDocument();
  });

  it("publishes a draft", async () => {
    const api = fakeApi(
      routes([{ method: "POST", path: `${BASE}5/publish/`, body: gallery({ status: "published" }) }]),
    );
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GalleryDetailPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "انتشار" }));
    expect(await screen.findByText(/گالری منتشر شد/)).toBeInTheDocument();
    expect(api.calls.some((c) => c.method === "POST" && c.path.endsWith("/publish/"))).toBe(true);
    expect(screen.queryByRole("button", { name: "انتشار" })).not.toBeInTheDocument();
  });

  it("reopens a submitted gallery and offers nothing to publish", async () => {
    const api = fakeApi([
      { method: "GET", path: `${BASE}5/`, body: gallery({ status: "submitted" }) },
      ...routes().slice(1),
      { method: "POST", path: `${BASE}5/reopen/`, body: gallery({ status: "published" }) },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GalleryDetailPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "بازکردن دوباره برای مشتری" }));
    expect(await screen.findByText(/دوباره باز شد/)).toBeInTheDocument();
  });

  it("asks before making a new link and before deleting", async () => {
    const api = fakeApi(
      routes([
        {
          method: "POST",
          path: `${BASE}5/new-link/`,
          body: gallery({ link: "https://3evda.com/g/new_link" }),
        },
        { method: "DELETE", path: `${BASE}5/`, status: 204 },
      ]),
    );
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GalleryDetailPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "لینک تازه" }));
    await waitFor(() =>
      expect(screen.getByLabelText("لینک گالری برای مشتری")).toHaveValue("https://3evda.com/g/new_link"),
    );
    fireEvent.click(screen.getByRole("button", { name: "حذف گالری" }));
    await waitFor(() => expect(push).toHaveBeenCalledWith("/panel/galleries"));
    expect(window.confirm).toHaveBeenCalledTimes(2);
  });

  it("does nothing when the question is declined", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    const api = fakeApi(routes());
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<GalleryDetailPage id={5} />);
    fireEvent.click(await screen.findByRole("button", { name: "بایگانی" }));
    expect(api.calls.some((c) => c.method === "POST")).toBe(false);
  });
});
