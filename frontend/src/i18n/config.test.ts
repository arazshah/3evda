import { describe, expect, it } from "vitest";
import { directionOf, locales, defaultLocale } from "./config";

describe("locale config", () => {
  it("defaults to Persian", () => {
    expect(defaultLocale).toBe("fa");
    expect(locales).toEqual(["fa", "en"]);
  });

  it("maps each locale to its writing direction", () => {
    expect(directionOf("fa")).toBe("rtl");
    expect(directionOf("en")).toBe("ltr");
  });
});
