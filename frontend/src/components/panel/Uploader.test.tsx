import { fireEvent, screen, within } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import type { MediaAsset } from "@/lib/api/client";
import { renderWithQuery } from "@/test/render";
import { Uploader } from "./Uploader";

const file = (name: string) => new File(["x"], name, { type: "image/jpeg" });

describe("Uploader", () => {
  it("uploads every selected file and reports each outcome", async () => {
    const upload = vi.fn(async (f: File, onProgress: (n: number) => void) => {
      onProgress(0.5);
      if (f.name === "bad.svg") throw { code: "unsupported_type", detail: "این نوع فایل پشتیبانی نمی‌شود." };
      return { asset: { id: f.name } as MediaAsset, duplicate: f.name === "again.jpg" };
    });
    renderWithQuery(<Uploader upload={upload} />);

    fireEvent.change(screen.getByLabelText("انتخاب فایل برای آپلود"), {
      target: { files: [file("a.jpg"), file("again.jpg"), file("bad.svg")] },
    });

    const queue = await screen.findByRole("list", { name: "صف آپلود" });
    expect(await within(queue).findByText("آپلود شد")).toBeInTheDocument();
    expect(await within(queue).findByText("قبلاً آپلود شده بود")).toBeInTheDocument();
    expect(await within(queue).findByText("این نوع فایل پشتیبانی نمی‌شود.")).toBeInTheDocument();
    expect(upload).toHaveBeenCalledTimes(3);
  });
});
