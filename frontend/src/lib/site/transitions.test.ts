import { describe, expect, it } from "vitest";
import { vtName } from "./transitions";

describe("vtName", () => {
  it("keeps a plain slug as it is", () => {
    expect(vtName("project-naranj-cafe")).toEqual({ viewTransitionName: "project-naranj-cafe" });
  });

  it("replaces characters that are not valid in a view transition name", () => {
    expect(vtName("project-کافه نارنج/۱").viewTransitionName).toMatch(/^[a-zA-Z0-9_-]+$/);
  });
});
