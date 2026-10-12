import { fireEvent, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { fakeApi, renderWithQuery } from "@/test/render";
import { WatermarkForm } from "./WatermarkForm";

afterEach(() => vi.unstubAllGlobals());

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
      fakeApi([{ method: "GET", path: "/api/admin/settings/watermark", body: setting }]).fetchImpl,
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
      fakeApi([
        { method: "GET", path: "/api/admin/settings/watermark", body: { ...setting, marked_count: 10 } },
      ]).fetchImpl,
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
    vi.stubGlobal("fetch", api.fetchImpl);
    renderWithQuery(<WatermarkForm />);

    fireEvent.click(await screen.findByRole("button", { name: "اعمال دوباره روی همه‌ی عکس‌ها" }));
    await vi.waitFor(() => expect(api.calls.some((c) => c.method === "POST")).toBe(true));

    fireEvent.click(screen.getByRole("button", { name: "ذخیره" }));
    expect(await screen.findByText(/روی همه‌ی عکس‌های سایت اعمال می‌شود/)).toBeInTheDocument();
    const put = api.calls.find((c) => c.method === "PUT");
    expect(put?.body).toMatchObject({ enabled: true, text: "© سودا" });
    expect(put?.body).not.toHaveProperty("ready_count");
  });
});
