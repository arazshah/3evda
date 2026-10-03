import { describe, expect, it } from "vitest";
import { formatToman, href, instagramUrl, pick, telHref, whatsappUrl } from "./text";

describe("site text helpers", () => {
  it("falls back to the other language when one is empty", () => {
    expect(pick("fa", "سلام", "Hello")).toBe("سلام");
    expect(pick("en", "سلام", "")).toBe("سلام");
    expect(pick("fa", "", "")).toBe("");
  });

  it("builds locale-aware paths", () => {
    expect(href("fa", "/about")).toBe("/about");
    expect(href("en", "/about")).toBe("/en/about");
    expect(href("en", "/")).toBe("/en");
    expect(href("en", "https://example.com")).toBe("https://example.com");
  });

  it("normalises contact handles", () => {
    expect(telHref("+98 44 3333 1234")).toBe("tel:+984433331234");
    expect(instagramUrl("@3evda.r")).toBe("https://www.instagram.com/3evda.r/");
    expect(whatsappUrl("+98 912 000 0000")).toBe("https://wa.me/989120000000");
  });

  it("formats prices per locale", () => {
    expect(formatToman(1500000, "en")).toBe("1,500,000");
    expect(formatToman(1500000, "fa")).toContain("۱");
  });
});
