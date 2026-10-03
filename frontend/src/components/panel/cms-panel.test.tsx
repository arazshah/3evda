import { fireEvent, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { ContentBlocks } from "./ContentBlocks";
import { MediaPicker, type PickedMedia } from "./MediaPicker";
import { SettingsForm } from "./SettingsForm";

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

const settings = {
  logo: null,
  og_image: null,
  logo_detail: null,
  og_image_detail: null,
  brand_name_fa: "سودا",
  brand_name_en: "Sevda",
  updated_at: "2026-10-03T00:00:00Z",
};

describe("SettingsForm", () => {
  it("saves edited fields with the picked logo and refreshes the public site", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/settings", body: settings },
      { method: "GET", path: "/api/admin/media/", body: { count: 1, results: [asset] } },
      { method: "PATCH", path: "/api/admin/cms/settings", body: { ...settings, brand_name_fa: "نام نو" } },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<SettingsForm />);

    const name = await screen.findByLabelText("نام برند (فارسی)");
    fireEvent.change(name, { target: { value: "نام نو" } });
    fireEvent.click(screen.getByRole("button", { name: "انتخاب لوگو" }));
    fireEvent.click(await screen.findByRole("button", { name: "Plate" }));
    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));

    expect(await screen.findByText("ذخیره شد و روی سایت اعمال شد.")).toBeInTheDocument();
    const patch = api.calls.find((c) => c.method === "PATCH");
    expect(patch?.body).toMatchObject({ brand_name_fa: "نام نو", logo: asset.id, og_image: null });
    expect(revalidatePublic).toHaveBeenCalledWith("site");
  });

  it("shows the server's message when saving fails", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/settings", body: settings },
      {
        method: "PATCH",
        path: "/api/admin/cms/settings",
        status: 400,
        body: { code: "invalid", detail: "داده نامعتبر است", fields: { email: ["bad"] } },
      },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<SettingsForm />);
    fireEvent.click(await screen.findByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText("داده نامعتبر است")).toBeInTheDocument();
    expect(await screen.findByText("bad")).toBeInTheDocument();
    expect(revalidatePublic).not.toHaveBeenCalled();
  });
});

describe("ContentBlocks", () => {
  const blocks = [
    {
      key: "home.intro_title",
      display_name: "معرفی: عنوان",
      group: "home",
      kind: "text",
      text_fa: "سلام",
      text_en: "Hi",
      media: null,
      media_detail: null,
      updated_at: "t1",
    },
    {
      key: "about.title",
      display_name: "عنوان صفحه",
      group: "about",
      kind: "text",
      text_fa: "من",
      text_en: "Me",
      media: null,
      media_detail: null,
      updated_at: "t1",
    },
    {
      key: "home.intro_image",
      display_name: "معرفی: تصویر",
      group: "home",
      kind: "image",
      text_fa: "",
      text_en: "",
      media: null,
      media_detail: null,
      updated_at: "t1",
    },
  ];

  it("lists one group at a time and saves a text block", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/blocks/", body: blocks },
      { method: "PATCH", path: "/api/admin/cms/blocks/home.intro_title/", body: blocks[0] },
      { method: "GET", path: "/api/admin/cms/blocks/", body: blocks },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ContentBlocks />);

    const form = await screen.findByRole("form", { name: "معرفی: عنوان" });
    expect(screen.queryByRole("form", { name: "عنوان صفحه" })).not.toBeInTheDocument();
    fireEvent.change(within(form).getByLabelText("فارسی"), { target: { value: "طعم" } });
    fireEvent.click(within(form).getByRole("button", { name: "ذخیره" }));

    await waitFor(() => expect(revalidatePublic).toHaveBeenCalledWith("site"));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ text_fa: "طعم", text_en: "Hi" });

    fireEvent.click(screen.getByRole("button", { name: "درباره‌ی من" }));
    expect(await screen.findByRole("form", { name: "عنوان صفحه" })).toBeInTheDocument();
  });

  it("edits an image block through the picker and can clear it", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/cms/blocks/", body: blocks },
      { method: "GET", path: "/api/admin/media/", body: { count: 1, results: [asset] } },
      { method: "PATCH", path: "/api/admin/cms/blocks/home.intro_image/", body: blocks[2] },
      { method: "GET", path: "/api/admin/cms/blocks/", body: blocks },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<ContentBlocks />);

    const form = await screen.findByRole("form", { name: "معرفی: تصویر" });
    fireEvent.click(within(form).getByRole("button", { name: /انتخاب/ }));
    fireEvent.click(await screen.findByRole("button", { name: "Plate" }));
    fireEvent.click(within(form).getByRole("button", { name: "ذخیره" }));
    await waitFor(() => expect(api.calls.some((c) => c.method === "PATCH")).toBe(true));
    expect(api.calls.find((c) => c.method === "PATCH")?.body).toEqual({ media: asset.id });
  });
});

describe("MediaPicker uploads", () => {
  it("keeps polling while a new upload is processing and enables it once ready", async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    try {
      const pending = {
        ...asset,
        id: "22222222-2222-2222-2222-222222222222",
        status: "pending",
        title: "Fresh",
        variants: [],
      };
      const api = fakeApi([
        { method: "GET", path: "/api/admin/media/", body: { count: 1, results: [pending] } },
        {
          method: "GET",
          path: "/api/admin/media/",
          body: { count: 1, results: [{ ...pending, status: "ready", variants: [variant] }] },
        },
      ]);
      vi.stubGlobal("fetch", api.fetchImpl);
      renderWithQuery(<MediaPicker label="لوگو" value={null} onChange={() => {}} />);
      fireEvent.click(screen.getByRole("button", { name: "انتخاب لوگو" }));
      expect(await screen.findByRole("button", { name: "Fresh (در صف)" })).toBeDisabled();
      await vi.advanceTimersByTimeAsync(3500);
      expect(await screen.findByRole("button", { name: "Fresh" })).toBeEnabled();
    } finally {
      vi.useRealTimers();
    }
  });
});

describe("MediaPicker", () => {
  it("shows the chosen picture, hides remove when required and clears otherwise", () => {
    const value: PickedMedia = { id: "x", src: "/media/a.webp", label: "A" };
    const onChange = vi.fn();
    const { rerender } = renderWithQuery(<MediaPicker label="لوگو" value={value} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "حذف لوگو" }));
    expect(onChange).toHaveBeenCalledWith(null);
    rerender(<MediaPicker label="لوگو" value={value} onChange={onChange} required />);
    expect(screen.queryByRole("button", { name: "حذف لوگو" })).not.toBeInTheDocument();
  });
});
