import { fireEvent, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeAll, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { MediaPicker } from "./MediaPicker";

const { uploadMedia } = vi.hoisted(() => ({ uploadMedia: vi.fn() }));
vi.mock("@/lib/upload", () => ({ uploadMedia }));

beforeAll(() => {
  HTMLDialogElement.prototype.showModal ??= function (this: HTMLDialogElement) {
    this.setAttribute("open", "");
  };
  HTMLDialogElement.prototype.close = function (this: HTMLDialogElement) {
    this.removeAttribute("open");
    this.dispatchEvent(new Event("close"));
  };
});
afterEach(() => {
  vi.unstubAllGlobals();
  uploadMedia.mockReset();
});

const asset = (status: string, variants: unknown[] = []) => ({
  id: "33333333-3333-3333-3333-333333333333",
  kind: "image",
  status,
  original_filename: "new.jpg",
  title: "",
  alt_fa: "",
  alt_en: "",
  lqip: "",
  variants,
});
const ready = asset("ready", [
  { name: "w480", format: "webp", url: "/media/n.webp", width: 480, height: 480, size_bytes: 1 },
]);
const GET = { method: "GET", path: "/api/admin/media/" };
const ONE = { method: "GET", path: "/api/admin/media/33333333-3333-3333-3333-333333333333/" };

describe("MediaPicker upload", () => {
  it("takes a lone upload only once the worker has finished it (a field accepts a ready image only)", async () => {
    // The worker is asynchronous: the upload answers pending, the list shows it pending, then ready on a later poll.
    uploadMedia.mockResolvedValue({ asset: asset("pending"), duplicate: false });
    const api = fakeApi([
      { ...GET, body: { count: 0, results: [] } },
      // The list on screen (page 1, or any page) need not contain the new file: it is looked up by id.
      { ...GET, body: { count: 40, results: [] } },
      { ...ONE, body: asset("pending") },
      { ...ONE, body: ready },
      { ...ONE, body: ready },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const onChange = vi.fn();
    renderWithQuery(<MediaPicker label="تصویر" value={null} onChange={onChange} spec="hero" />);

    fireEvent.click(screen.getByRole("button", { name: "انتخاب تصویر" }));
    const input = await screen.findByLabelText("انتخاب فایل برای آپلود");
    fireEvent.change(input, { target: { files: [new File(["x"], "new.jpg", { type: "image/jpeg" })] } });

    expect(await screen.findByText(/در حال آماده‌سازی تصویر/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
    await waitFor(() => expect(onChange).toHaveBeenCalledOnce(), { timeout: 8000 });
    expect(onChange.mock.calls[0]![0]).toMatchObject({ id: ready.id, src: "/media/n.webp" });
  }, 12000);

  it("says so when the worker could not process the upload", async () => {
    uploadMedia.mockResolvedValue({ asset: asset("pending"), duplicate: false });
    const api = fakeApi([
      { ...GET, body: { count: 0, results: [] } },
      { ...GET, body: { count: 1, results: [] } },
      { ...ONE, body: asset("failed") },
    ]);
    vi.stubGlobal("fetch", api.fetchImpl);
    const onChange = vi.fn();
    renderWithQuery(<MediaPicker label="تصویر" value={null} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button", { name: "انتخاب تصویر" }));
    const input = await screen.findByLabelText("انتخاب فایل برای آپلود");
    fireEvent.change(input, { target: { files: [new File(["x"], "bad.jpg", { type: "image/jpeg" })] } });
    expect(await screen.findByText(/پردازش این تصویر ناموفق بود/)).toBeInTheDocument();
    expect(onChange).not.toHaveBeenCalled();
  });

  it("shows the exact size to shoot for under the field", () => {
    vi.stubGlobal("fetch", fakeApi([]).fetchImpl);
    renderWithQuery(<MediaPicker label="تصویر شاخص" value={null} onChange={() => {}} spec="project_cover" />);
    expect(screen.getByText(/1600×2000 پیکسل/)).toBeInTheDocument();
    expect(screen.getByText(/۴:۵ عمودی/)).toBeInTheDocument();
  });
});
