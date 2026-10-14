import { fireEvent, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { WatermarkForm } from "./WatermarkForm";

beforeEach(() => {
  // jsdom has no object URLs; the preview is a blob the server made.
  URL.createObjectURL = vi.fn(() => "blob:preview");
  URL.revokeObjectURL = vi.fn();
});
afterEach(() => vi.unstubAllGlobals());

/** The fake API answers JSON; the preview endpoint answers a picture, so wrap it. */
function withPreview(fetchImpl: (input: RequestInfo | URL, init?: RequestInit) => Promise<Response>) {
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = input instanceof Request ? input.url : String(input);
    if (url.includes("/watermark/preview"))
      return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
    return fetchImpl(input, init);
  };
}

const setting = {
  enabled: true,
  text: "© سودا",
  opacity: 0.5,
  position: "bottom_right",
  size_ratio: 0.035,
  updated_at: "t",
  ready_count: 10,
  marked_count: 4,
};

describe("WatermarkForm", () => {
  it("says how many photos carry the watermark and that the rest are being redone", async () => {
    vi.stubGlobal(
      "fetch",
      withPreview(
        fakeApi([{ method: "GET", path: "/api/admin/settings/watermark", body: setting }]).fetchImpl,
      ),
    );
    renderWithQuery(<WatermarkForm />);
    const line = await screen.findByRole("status");
    expect(line).toHaveTextContent("عکس‌های آماده: ۱۰");
    expect(line).toHaveTextContent("دارای واترمارک: ۴");
    expect(line).toHaveTextContent("در حال اعمال تغییر");
  });

  it("is quiet when every photo already matches the settings", async () => {
    vi.stubGlobal(
      "fetch",
      withPreview(
        fakeApi([
          { method: "GET", path: "/api/admin/settings/watermark", body: { ...setting, marked_count: 10 } },
        ]).fetchImpl,
      ),
    );
    renderWithQuery(<WatermarkForm />);
    expect(await screen.findByRole("status")).not.toHaveTextContent("در حال اعمال");
  });

  it("applies the watermark to all existing photos on demand, and when saved", async () => {
    const api = fakeApi([
      { method: "GET", path: "/api/admin/settings/watermark", body: setting },
      { method: "POST", path: "/api/admin/settings/watermark/apply", status: 202, body: setting },
      { method: "PUT", path: "/api/admin/settings/watermark", body: setting },
    ]);
    vi.stubGlobal("fetch", withPreview(api.fetchImpl));
    renderWithQuery(<WatermarkForm />);

    fireEvent.click(await screen.findByRole("button", { name: "اعمال دوباره روی همه‌ی عکس‌ها" }));
    await vi.waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText(/روی همه‌ی عکس‌های سایت اعمال می‌شود/)).toBeInTheDocument();
    const put = api.calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ enabled: true, text: "© سودا" });
    expect(put?.body).not.toHaveProperty("ready_count");
  });

  it("shows the picture the server makes for the current look, and offers the tiled mode", async () => {
    const calls: { url: string; body: unknown }[] = [];
    const api = fakeApi([{ method: "GET", path: "/api/admin/settings/watermark", body: setting }]);
    vi.stubGlobal("fetch", async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("/watermark/preview")) {
        calls.push({ url, body: JSON.parse(String(init?.body)) });
        return new Response(new Blob(["png"], { type: "image/png" }), { status: 200 });
      }
      return api.fetchImpl(input, init);
    });
    renderWithQuery(<WatermarkForm />);

    const image = await screen.findByAltText("پیش‌نمایش واترمارک روی یک عکس نمونه");
    expect(image).toHaveAttribute("src", "blob:preview");
    expect(screen.getByRole("option", { name: /پخش روی کل عکس/ })).toBeInTheDocument();
    fireEvent.change(screen.getByLabelText("جای قرارگیری"), { target: { value: "tile" } });
    await vi.waitFor(() => expect(calls.at(-1)?.body).toMatchObject({ position: "tile", text: "© سودا" }));
  });

  it("says plainly when the watermark is off", async () => {
    vi.stubGlobal(
      "fetch",
      withPreview(
        fakeApi([
          { method: "GET", path: "/api/admin/settings/watermark", body: { ...setting, enabled: false } },
        ]).fetchImpl,
      ),
    );
    renderWithQuery(<WatermarkForm />);
    expect(await screen.findByText(/واترمارک خاموش است/)).toBeInTheDocument();
  });
});
