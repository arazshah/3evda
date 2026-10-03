import { describe, expect, it } from "vitest";
import { moveId } from "./reorder";

describe("moveId", () => {
  it("swaps with the neighbour", () => {
    expect(moveId([1, 2, 3], 1, -1)).toEqual([2, 1, 3]);
    expect(moveId([1, 2, 3], 1, 1)).toEqual([1, 3, 2]);
  });

  it("does nothing past either end or for a bad index", () => {
    const ids = [1, 2, 3];
    expect(moveId(ids, 0, -1)).toBe(ids);
    expect(moveId(ids, 2, 1)).toBe(ids);
    expect(moveId(ids, 7, 1)).toBe(ids);
  });

  it("does not mutate its input", () => {
    const ids = [1, 2];
    moveId(ids, 0, 1);
    expect(ids).toEqual([1, 2]);
  });
});
