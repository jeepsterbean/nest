import { describe, expect, it } from "vitest";
import {
  cascadeSpot,
  clampMapView,
  connectorPath,
  MAP_BOARD_HEIGHT,
  MAP_BOARD_WIDTH,
  parseMapView,
  readTaskMapView,
  writeTaskMapView,
  zoomAround,
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

const box = (x: number, y: number) => ({ x, y, width: 200, height: 100 });

describe("map placement", () => {
  it("puts the box exactly where it was dropped", () => {
    expect(placeOnMap({}, 7, { x: 240, y: 96 })).toEqual({
      "7": { x: 240, y: 96 },
    });
  });

  it("keeps boxes inside the board", () => {
    expect(placeOnMap({}, 1, { x: -40, y: -8.4 })["1"]).toEqual({ x: 0, y: 0 });
    const far = placeOnMap({}, 1, { x: 99_000, y: 99_000 })["1"];
    expect(far.x).toBeLessThan(MAP_BOARD_WIDTH);
    expect(far.y).toBeLessThan(MAP_BOARD_HEIGHT);
  });

  it("cascades click-placed boxes clear of the ones already down", () => {
    const first = cascadeSpot({});
    const second = cascadeSpot({ "1": first });
    expect(second).not.toEqual(first);
    expect(cascadeSpot({ "1": first, "2": second })).not.toEqual(second);
  });

  it("sends a box back to the Map sidebar", () => {
    expect(removeFromMap({ "1": { x: 0, y: 0 } }, 1)).toEqual({});
  });

  it("drops positions for tasks that no longer exist", () => {
    const layout = { "1": { x: 0, y: 0 }, "2": { x: 40, y: 0 } };
    expect(pruneTaskMapLayout(layout, new Set([1]))).toEqual({
      "1": { x: 0, y: 0 },
    });
    expect(pruneTaskMapLayout(layout, new Set([1, 2]))).toBe(layout);
  });

  it("cascades from wherever the view is centred", () => {
    expect(cascadeSpot({}, { x: 900, y: 700 })).toEqual({ x: 900, y: 700 });
  });

  it("settles at the board corner instead of looping when every spot is taken", () => {
    const corner = cascadeSpot({}, { x: MAP_BOARD_WIDTH, y: MAP_BOARD_HEIGHT });
    expect(cascadeSpot({ "1": corner }, { x: MAP_BOARD_WIDTH, y: MAP_BOARD_HEIGHT }))
      .toEqual(corner);
  });
});

describe("connectors", () => {
  it("leaves the sides that face each other", () => {
    const right = connectorPath(box(0, 0), box(400, 20));
    expect(right.from).toEqual({ x: 200, y: 50 });
    expect(right.to).toEqual({ x: 400, y: 70 });
    expect(right.d).toBe("M200 50 H300 V70 H400");
  });

  it("routes vertically when the boxes are stacked", () => {
    const down = connectorPath(box(0, 0), box(20, 400));
    expect(down.from).toEqual({ x: 100, y: 100 });
    expect(down.to).toEqual({ x: 120, y: 400 });
    expect(down.d).toBe("M100 100 V250 H120 V400");
  });
});

describe("pan and zoom", () => {
  const viewport = { width: 1000, height: 800 };

  it("keeps the board point under the cursor while zooming", () => {
    const zoomed = zoomAround({ x: 0, y: 0, zoom: 1 }, 2, { x: 300, y: 200 });
    expect(zoomed.zoom).toBe(2);
    expect(zoomed).toEqual({ x: -300, y: -200, zoom: 2 });
  });

  it("stops zooming out past the limit", () => {
    expect(zoomAround({ x: 0, y: 0, zoom: 0.3 }, 0.1, { x: 0, y: 0 }).zoom).toBe(0.25);
    expect(zoomAround({ x: 0, y: 0, zoom: 1.9 }, 10, { x: 0, y: 0 }).zoom).toBe(2);
  });

  it("never pans the canvas off the viewport", () => {
    expect(clampMapView({ x: 200, y: 200, zoom: 1 }, viewport)).toEqual({
      x: 0,
      y: 0,
      zoom: 1,
    });
    const far = clampMapView({ x: -99_000, y: -99_000, zoom: 1 }, viewport);
    expect(far.x).toBe(viewport.width - MAP_BOARD_WIDTH);
    expect(far.y).toBe(viewport.height - MAP_BOARD_HEIGHT);
  });

  it("falls back to the default view for junk", () => {
    expect(parseMapView({ x: 1, y: 2 })).toEqual({ x: 0, y: 0, zoom: 1 });
    const storage = memory();
    writeTaskMapView({ x: -40, y: -60, zoom: 1.5 }, storage);
    expect(readTaskMapView(storage)).toEqual({ x: -40, y: -60, zoom: 1.5 });
  });
});

describe("stored layout", () => {
  it("ignores malformed entries", () => {
    expect(
      parseTaskMapLayout({
        "1": { x: 12, y: 30 },
        "2": { x: Number.NaN, y: 0 },
        "3": null,
        four: { x: 2, y: 0 },
      }),
    ).toEqual({ "1": { x: 12, y: 30 } });
    expect(parseTaskMapLayout("nope")).toEqual({});
  });

  it("round-trips through storage and survives junk", () => {
    const storage = memory();
    writeTaskMapLayout({ "1": { x: 30, y: 200 } }, storage);
    expect(readTaskMapLayout(storage)).toEqual({ "1": { x: 30, y: 200 } });
    storage.setItem("nest:task-map-v2", "{oops");
    expect(readTaskMapLayout(storage)).toEqual({});
  });
});
