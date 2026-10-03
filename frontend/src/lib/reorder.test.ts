import { describe, expect, it } from "vitest";
import { mergeGroupOrder, moveId } from "./reorder";

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

describe("mergeGroupOrder", () => {
  it("reorders one group inside the complete list, leaving the others where they are", () => {
    // groups interleaved: A = 1,3  B = 2,4
    expect(mergeGroupOrder([1, 2, 3, 4], [3, 1])).toEqual([3, 2, 1, 4]);
    expect(mergeGroupOrder([1, 2, 3, 4], [4, 2])).toEqual([1, 4, 3, 2]);
  });

  it("keeps every id exactly once", () => {
    const merged = mergeGroupOrder([5, 6, 7], [7, 5]);
    expect([...merged].sort()).toEqual([5, 6, 7]);
  });
});
