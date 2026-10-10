import { render, screen, within } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { IMAGE_SPEC_ORDER, IMAGE_SPECS, sizeLabel } from "@/lib/image-specs";
import { ImageGuide } from "./ImageGuide";

describe("ImageGuide", () => {
  it("lists every picture slot with its exact size, ratio and format", () => {
    render(<ImageGuide />);
    const table = screen.getByRole("table", { name: "اندازه‌ی پیشنهادی هر تصویر" });
    const rows = within(table).getAllByRole("row").slice(1);
    expect(rows).toHaveLength(IMAGE_SPEC_ORDER.length);
    for (const key of IMAGE_SPEC_ORDER) {
      const spec = IMAGE_SPECS[key];
      const row = within(table).getByRole("row", { name: new RegExp(spec.title) });
      expect(row).toHaveTextContent(sizeLabel(spec));
      expect(row).toHaveTextContent(spec.ratio);
    }
    expect(screen.getByRole("heading", { name: "راهنمای اندازه‌ی تصاویر" })).toBeInTheDocument();
  });

  it("gives the hero 2400×1350 and a portrait slot 1600×2000", () => {
    expect(sizeLabel(IMAGE_SPECS.hero)).toBe("2400×1350 پیکسل");
    expect(sizeLabel(IMAGE_SPECS.project_cover)).toBe("1600×2000 پیکسل");
    expect(sizeLabel(IMAGE_SPECS.project_image)).toBe("ضلع بلند 2400 پیکسل");
  });
});
