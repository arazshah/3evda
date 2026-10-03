import { describe, expect, it } from "vitest";
import { switchPathFor } from "./blog";

describe("switchPathFor", () => {
  const base = "/blog/category/food";

  it("keeps the filter when the other language has it too", () => {
    expect(switchPathFor(base, [{ slug: "tea" }, { slug: "food" }], "food")).toBe(base);
  });

  it("falls back to the journal when the other language has no such category or tag", () => {
    expect(switchPathFor(base, [{ slug: "tea" }], "food")).toBe("/blog");
    expect(switchPathFor(base, [], "food")).toBe("/blog");
  });
});
