import { describe, expect, it } from "vitest";
import { moveId, moveItem } from "../../src/lib/reorder";

describe("moveItem", () => {
  it("moves an item to a new index", () => {
    expect(moveItem(["a", "b", "c"], 0, 2)).toEqual(["b", "c", "a"]);
    expect(moveItem(["a", "b", "c"], 2, 0)).toEqual(["c", "a", "b"]);
  });

  it("returns the same array when the move is a no-op", () => {
    const items = ["a", "b"];
    expect(moveItem(items, 1, 1)).toBe(items);
    expect(moveItem(items, -1, 0)).toBe(items);
    expect(moveItem(items, 0, 2)).toBe(items);
  });
});

describe("moveId", () => {
  it("moves the dragged id onto the target's slot", () => {
    expect(moveId([1, 2, 3], 1, 3)).toEqual([2, 3, 1]);
    expect(moveId([1, 2, 3], 3, 2)).toEqual([1, 3, 2]);
  });
});
