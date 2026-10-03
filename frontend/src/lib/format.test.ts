import { describe, expect, it } from "vitest";
import { formatBytes, formatDuration, formatNumber } from "./format";

describe("Persian formatting", () => {
  it("uses Persian digits", () => {
    expect(formatNumber(1234)).toBe("۱٬۲۳۴");
  });

  it("formats file sizes", () => {
    expect(formatBytes(512)).toBe("۵۱۲ بایت");
    expect(formatBytes(1536)).toBe("۱٫۵ کیلوبایت");
    expect(formatBytes(5 * 1024 * 1024)).toBe("۵ مگابایت");
  });

  it("formats durations as m:ss", () => {
    expect(formatDuration(65)).toBe("۱:۰۵");
    expect(formatDuration(9.6)).toBe("۰:۱۰");
  });
});
