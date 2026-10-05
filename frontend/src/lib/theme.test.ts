import { describe, expect, it } from "vitest";
import { parseTheme } from "./theme";

describe("parseTheme", () => {
  it("accepts only the two explicit choices", () => {
    expect(parseTheme("light")).toBe("light");
    expect(parseTheme("dark")).toBe("dark");
  });

  it("treats a missing or unknown cookie as following the system", () => {
    expect(parseTheme(undefined)).toBe("system");
    expect(parseTheme("")).toBe("system");
    expect(parseTheme("sepia")).toBe("system");
  });
});
