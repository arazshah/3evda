import { describe, expect, it } from "vitest";
import { fromLocalInput, toLocalInput } from "./datetime";

describe("datetime-local helpers", () => {
  it("round-trips through the browser's local time", () => {
    const local = "2026-10-03T14:30";
    expect(toLocalInput(fromLocalInput(local))).toBe(local);
  });

  it("treats empty or invalid values as 'no date'", () => {
    expect(fromLocalInput("")).toBeNull();
    expect(fromLocalInput("nonsense")).toBeNull();
    expect(toLocalInput(null)).toBe("");
    expect(toLocalInput("nonsense")).toBe("");
  });
});
