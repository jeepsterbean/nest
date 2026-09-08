import { describe, expect, it } from "vitest";
import {
  mapRowCount,
  parseTaskMapLayout,
  placeOnMap,
  pruneTaskMapLayout,
  readTaskMapLayout,
  removeFromMap,
  writeTaskMapLayout,
} from "../../../src/dashboard/lib/taskMap";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("map placement", () => {
  it("puts the card where it was dropped", () => {
    expect(placeOnMap({}, 7, { x: 2, y: 1 })).toEqual({ "7": { x: 2, y: 1 } });
  });

  it("snaps to the nearest free cell when the target is taken, top-left first", () => {
    const layout = { "1": { x: 2, y: 1 }, "2": { x: 1, y: 1 } };
    expect(placeOnMap(layout, 3, { x: 2, y: 1 })["3"]).toEqual({ x: 2, y: 0 });
  });

  it("keeps a card in place when it is dropped on its own cell", () => {
    const layout = { "1": { x: 2, y: 1 } };
    expect(placeOnMap(layout, 1, { x: 2, y: 1 })).toEqual(layout);
  });

  it("clamps a drop outside the columns", () => {
    expect(placeOnMap({}, 1, { x: 9, y: -3 })["1"]).toEqual({ x: 5, y: 0 });
  });

  it("sends a card back to the tray", () => {
    expect(removeFromMap({ "1": { x: 0, y: 0 } }, 1)).toEqual({});
  });

  it("drops positions for tasks that no longer exist", () => {
    const layout = { "1": { x: 0, y: 0 }, "2": { x: 1, y: 0 } };
    expect(pruneTaskMapLayout(layout, new Set([1]))).toEqual({
      "1": { x: 0, y: 0 },
    });
    expect(pruneTaskMapLayout(layout, new Set([1, 2]))).toBe(layout);
  });

  it("keeps one spare row under the lowest card", () => {
    expect(mapRowCount({})).toBe(4);
    expect(mapRowCount({ "1": { x: 0, y: 6 } })).toBe(8);
  });
});

describe("stored layout", () => {
  it("ignores malformed entries and duplicate cells", () => {
    expect(
      parseTaskMapLayout({
        "1": { x: 0, y: 0 },
        "2": { x: 0, y: 0 },
        "3": { x: 1.5, y: 0 },
        "4": { x: 9, y: 0 },
        "5": null,
        six: { x: 2, y: 0 },
      }),
    ).toEqual({ "1": { x: 0, y: 0 } });
    expect(parseTaskMapLayout("nope")).toEqual({});
  });

  it("round-trips through storage and survives junk", () => {
    const storage = memory();
    writeTaskMapLayout({ "1": { x: 3, y: 2 } }, storage);
    expect(readTaskMapLayout(storage)).toEqual({ "1": { x: 3, y: 2 } });
    storage.setItem("nest:task-map", "{oops");
    expect(readTaskMapLayout(storage)).toEqual({});
  });
});
