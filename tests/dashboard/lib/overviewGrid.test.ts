import { describe, expect, it } from "vitest";
import {
  buildOverviewLayoutSnapshot,
  canShowTile,
  CONTROL_PANEL_ID,
  COLS,
  DEFAULT_LAYOUT,
  expandTile,
  hiddenTileIds,
  hideTile,
  minimiseTile,
  moveTile,
  overlaps,
  parseOverviewLayoutSnapshots,
  parseTileLayout,
  pointerDeltaToCells,
  pointerToCell,
  previewMoveTile,
  previewResizeTile,
  restoredTileSize,
  resizeTile,
  ROWS,
  saveOverviewLayoutSnapshot,
  showTile,
  type TileLayout,
} from "../../../src/dashboard/lib/overviewGrid";

const tile = (
  id: TileLayout["id"],
  x: number,
  y: number,
  w: number,
  h: number,
): TileLayout => ({ id, x, y, w, h, minimised: false });

describe("overview grid", () => {
  const expectInBounds = (layout: TileLayout[]) => {
    for (const current of layout) {
      expect(current.x).toBeGreaterThanOrEqual(0);
      expect(current.y).toBeGreaterThanOrEqual(0);
      expect(current.x + current.w).toBeLessThanOrEqual(COLS);
      expect(current.y + current.h).toBeLessThanOrEqual(ROWS);
    }
  };

  const expectNoOverlaps = (layout: TileLayout[]) => {
    for (const [index, current] of layout.entries()) {
      expect(
        layout.slice(index + 1).some((other) => overlaps(current, other)),
      ).toBe(false);
    }
  };

  it("keeps the default layout in bounds without overlaps", () => {
    for (const [index, current] of DEFAULT_LAYOUT.entries()) {
      expect(current.x).toBeGreaterThanOrEqual(0);
      expect(current.y).toBeGreaterThanOrEqual(0);
      expect(current.x + current.w).toBeLessThanOrEqual(COLS);
      expect(current.y + current.h).toBeLessThanOrEqual(ROWS);
      expect(
        DEFAULT_LAYOUT.slice(index + 1).some((other) => overlaps(current, other)),
      ).toBe(false);
    }
    expect(
      DEFAULT_LAYOUT.reduce((area, current) => area + current.w * current.h, 0),
    ).toBeLessThanOrEqual(COLS * ROWS);
  });

  it("keeps the packed default layout draggable by trading slots", () => {
    // The default board fills every cell, so a push has no free rect to move a
    // displaced tile into. Without the slot swap almost every drag dead-ends.
    for (const id of ["lastHour", "tasks", "timeline", "brainDump"] as const) {
      const landed = [];
      for (let dx = -COLS; dx <= COLS; dx += 1) {
        for (let dy = -ROWS; dy <= ROWS; dy += 1) {
          if (!dx && !dy) continue;
          const moved = previewMoveTile(DEFAULT_LAYOUT, id, dx, dy);
          if (!moved) continue;
          landed.push(moved);
          expectInBounds(moved);
          expectNoOverlaps(moved);
        }
      }
      expect(landed.length).toBeGreaterThan(50);
    }
  });

  it("swaps two tiles when a drag covers a neighbour on a full board", () => {
    const moved = previewMoveTile(DEFAULT_LAYOUT, "tasks", 0, -2);
    const tasks = moved?.find((current) => current.id === "tasks");
    const lastHour = moved?.find((current) => current.id === "lastHour");

    expect(tasks).toMatchObject({ x: 0, y: 0, w: 8, h: 2 });
    expect(lastHour).toMatchObject({ x: 0, y: 2, w: 6, h: 5 });
    expectNoOverlaps(moved!);
  });

  it("refuses a slot swap that would breach a tile's minimum size", () => {
    // Metric check-in is pinned to 4x2, so it has no compatible slot to take.
    expect(previewMoveTile(DEFAULT_LAYOUT, "metrics", 0, 4)).toBeNull();
  });

  it("reflows neighbouring tiles when a move would overlap them", () => {
    const layout = [
      tile("tasks", 0, 0, 3, 2),
      tile("metrics", 3, 0, 4, 2),
      tile("brainDump", 7, 0, 3, 2),
    ];

    const moved = moveTile(layout, "metrics", -2, 0);
    expect(moved.find((current) => current.id === "metrics")).toMatchObject({
      x: 1,
      y: 0,
    });
    expect(moved.find((current) => current.id === "tasks")).not.toMatchObject({
      x: 0,
      y: 0,
    });
    expect(moved.find((current) => current.id === "brainDump")).toMatchObject({
      x: 7,
      y: 0,
    });
    expectNoOverlaps(moved);
    expect(moveTile(layout, "tasks", -1, 0)).toBe(layout);
  });

  it("previews pushed positions during a move drag", () => {
    const layout = [
      tile("tasks", 0, 0, 3, 2),
      tile("metrics", 3, 0, 4, 2),
      tile("brainDump", 7, 0, 3, 2),
    ];

    const preview = previewMoveTile(layout, "metrics", -2, 0);
    expect(preview).not.toBeNull();
    expect(preview?.find((current) => current.id === "metrics")).toMatchObject({
      x: 1,
      y: 0,
    });
    expect(preview?.find((current) => current.id === "tasks")).not.toMatchObject({
      x: 0,
      y: 0,
    });
    expect(preview?.find((current) => current.id === "brainDump")).toMatchObject({
      x: 7,
      y: 0,
    });
    expectNoOverlaps(preview!);
  });

  it("keeps untouched tiles fixed during a local push cascade", () => {
    const layout = [
      tile("lastHour", 0, 0, 4, 2),
      tile("metrics", 4, 0, 4, 2),
      tile("tasks", 0, 2, 4, 2),
      tile("brainDump", 4, 2, 4, 2),
    ];

    const moved = moveTile(layout, "metrics", -2, 0);
    expect(moved.find((current) => current.id === "metrics")).toMatchObject({
      x: 2,
      y: 0,
    });
    expect(moved.find((current) => current.id === "lastHour")).toMatchObject({
      x: 6,
      y: 0,
    });
    expect(moved.find((current) => current.id === "tasks")).toMatchObject({
      x: 0,
      y: 2,
    });
    expect(moved.find((current) => current.id === "brainDump")).toMatchObject({
      x: 4,
      y: 2,
    });
    expectNoOverlaps(moved);
  });

  it("does not move tiles that are only touched by another pushed tile", () => {
    const layout = [
      tile("lastHour", 0, 0, 4, 2),
      tile("metrics", 4, 0, 4, 2),
      tile("tasks", 0, 2, 4, 2),
      tile("brainDump", 4, 2, 4, 2),
      tile("timeline", 8, 2, 4, 2),
    ];

    const moved = moveTile(layout, "tasks", 1, 1);

    expect(moved.find((current) => current.id === "brainDump")).not.toMatchObject({
      x: 4,
      y: 2,
    });
    expect(moved.find((current) => current.id === "lastHour")).toMatchObject({
      x: 0,
      y: 0,
    });
    expect(moved.find((current) => current.id === "metrics")).toMatchObject({
      x: 4,
      y: 0,
    });
    expectNoOverlaps(moved);
  });

  it("clamps resize to minimums and reflows neighbours on growth", () => {
    const single = [tile("tasks", 0, 0, 6, 5)];
    expect(resizeTile(single, "tasks", -99, -99)[0]).toMatchObject({
      w: 3,
      h: 2,
    });
    expect(resizeTile(single, "tasks", 99, 99)[0]).toMatchObject({
      w: COLS,
      h: ROWS,
    });

    const crowded = [
      tile("tasks", 0, 0, 3, 2),
      tile("metrics", 3, 0, 4, 2),
      tile("brainDump", 7, 0, 3, 2),
    ];
    const resized = resizeTile(crowded, "tasks", 2, 0);
    expect(resized.find((current) => current.id === "tasks")).toMatchObject({
      w: 5,
      h: 2,
    });
    expectNoOverlaps(resized);
  });

  it("previews pushed positions during a resize drag", () => {
    const layout = [
      tile("tasks", 0, 0, 3, 2),
      tile("metrics", 3, 0, 4, 2),
      tile("brainDump", 7, 0, 3, 2),
    ];

    const preview = previewResizeTile(layout, "tasks", 2, 0);
    expect(preview).not.toBeNull();
    expect(preview?.find((current) => current.id === "tasks")).toMatchObject({
      w: 5,
      h: 2,
    });
    expectNoOverlaps(preview!);
  });

  it("restores a minimised height and shrinks it when space changed", () => {
    const layout = [tile("tasks", 0, 0, 3, 5)];
    const minimised = minimiseTile(layout, "tasks");
    expect(minimised[0]).toMatchObject({ h: 1, minimised: true, expandedH: 5 });
    expect(expandTile(minimised, "tasks")[0]).toMatchObject({
      h: 5,
      minimised: false,
    });

    const occupied = [...minimised, tile("lastHour", 0, 3, 4, 1)];
    const expanded = expandTile(occupied, "tasks");
    expect(expanded[0]).toMatchObject({
      h: 5,
      minimised: false,
    });
    expectNoOverlaps(expanded);
  });

  it("keeps a missing tile hidden, drops an unknown id, and restores the control panel", () => {
    const parsed = parseTileLayout([
      DEFAULT_LAYOUT.find((candidate) => candidate.id === "lastHour"),
      { id: "unknown", x: 0, y: 0, w: 1, h: 1, minimised: false },
    ]);

    expect(parsed.some(({ id }) => id === "lastHour")).toBe(true);
    expect(parsed.some(({ id }) => id === CONTROL_PANEL_ID)).toBe(true);
    expect(hiddenTileIds(parsed)).toContain("tasks");
    expect(parsed.some(({ id }) => id === ("unknown" as TileLayout["id"]))).toBe(
      false,
    );
  });

  it("migrates an older full five-tile layout by restoring the control panel and hiding brain dump", () => {
    const legacyLayout = [
      tile("lastHour", 0, 0, 8, 2),
      tile("metrics", 8, 0, 4, 2),
      tile("tasks", 0, 2, 6, 5),
      tile("brainDump", 0, 7, 6, 5),
      tile("timeline", 6, 2, 6, 10),
    ];

    const parsed = parseTileLayout(legacyLayout);

    expect(parsed.find((current) => current.id === CONTROL_PANEL_ID)).toMatchObject({
      x: 0,
      y: 11,
      w: 6,
      h: 1,
    });
    expect(hiddenTileIds(parsed)).toContain("brainDump");
  });

  it("hides tiles by removing them from the layout and never hides the control panel", () => {
    const hiddenTasks = hideTile(DEFAULT_LAYOUT, "tasks");
    expect(hiddenTasks.some((tile) => tile.id === "tasks")).toBe(false);
    expect(hiddenTileIds(hiddenTasks)).toContain("tasks");

    const controlPanelHidden = hideTile(DEFAULT_LAYOUT, CONTROL_PANEL_ID);
    expect(controlPanelHidden).toBe(DEFAULT_LAYOUT);
  });

  it("restores a minimisable tile minimised at the first free spot", () => {
    const layout = DEFAULT_LAYOUT.filter(
      (current) => current.id !== "tasks" && current.id !== "controlPanel",
    );

    const restored = showTile(layout, "tasks");
    const tasks = restored.find((current) => current.id === "tasks");

    expect(tasks).toMatchObject({
      minimised: true,
      w: restoredTileSize("tasks").w,
      h: 1,
      expandedH: 2,
    });
    expect(tasks).toMatchObject({ x: 0, y: 2 });
  });

  it("restores a hidden tile at the requested spot when it fits", () => {
    const layout = DEFAULT_LAYOUT.filter(
      (current) => current.id !== "tasks" && current.id !== "controlPanel",
    );

    const restored = showTile(layout, "tasks", { x: 0, y: 11 });

    expect(restored.find((current) => current.id === "tasks")).toMatchObject({
      x: 0,
      y: 11,
    });
  });

  it("keeps a hidden tile hidden when the board has no room", () => {
    const fullBoard = [{ id: "controlPanel", x: 0, y: 0, w: 12, h: 12, minimised: false } as TileLayout];

    expect(canShowTile(fullBoard, "tasks")).toBe(false);
    expect(showTile(fullBoard, "tasks")).toBe(fullBoard);
  });

  it("restores metric check-in at its fixed size", () => {
    const layout = DEFAULT_LAYOUT.filter((current) => current.id !== "metrics");
    const restored = showTile(layout, "metrics");

    expect(restored.find((current) => current.id === "metrics")).toMatchObject({
      w: 4,
      h: 2,
      minimised: false,
    });
  });

  it("rounds pointer deltas to cells", () => {
    expect(pointerDeltaToCells(149, -51, { width: 1200, height: 1200 })).toEqual({
      dx: 1,
      dy: -1,
    });
    expect(pointerDeltaToCells(151, 49, { width: 1200, height: 1200 })).toEqual({
      dx: 2,
      dy: 0,
    });
  });

  it("clamps pointer positions to grid cells", () => {
    expect(
      pointerToCell(-10, -25, { left: 0, top: 0, width: 1200, height: 1200 }),
    ).toEqual({ x: 0, y: 0 });
    expect(
      pointerToCell(1400, 1500, { left: 0, top: 0, width: 1200, height: 1200 }),
    ).toEqual({ x: 11, y: 11 });
  });

  it("keeps only valid saved layout snapshots", () => {
    const snapshots = parseOverviewLayoutSnapshots([
      buildOverviewLayoutSnapshot(DEFAULT_LAYOUT, "Default", 1000),
      {
        id: "broken",
        label: "Broken",
        savedAt: 2000,
        layout: [{ id: "unknown", x: 0, y: 0, w: 1, h: 1, minimised: false }],
      },
      { id: "", label: "Missing id", savedAt: 3000, layout: DEFAULT_LAYOUT },
    ]);

    expect(snapshots).toHaveLength(2);
    expect(snapshots[0]?.savedAt).toBe(2000);
    expect(snapshots[1]?.savedAt).toBe(1000);
    expect(snapshots[0]?.layout.some(({ id }) => id === CONTROL_PANEL_ID)).toBe(true);
    expect(hiddenTileIds(snapshots[0]?.layout ?? [])).toContain("tasks");
  });

  it("dedupes matching layouts when saving a snapshot", () => {
    const original = buildOverviewLayoutSnapshot(DEFAULT_LAYOUT, "First", 1000);
    const saved = saveOverviewLayoutSnapshot(
      [original!],
      DEFAULT_LAYOUT,
      "Renamed",
      2000,
    );

    expect(saved).toHaveLength(1);
    expect(saved[0]).toMatchObject({
      savedAt: 2000,
      label: "Renamed",
    });
    expect(saved[0]?.layout).not.toBe(DEFAULT_LAYOUT);
  });

  it("skips saving a snapshot when the label is blank", () => {
    const original = buildOverviewLayoutSnapshot(DEFAULT_LAYOUT, "First", 1000);
    const saved = saveOverviewLayoutSnapshot([original!], DEFAULT_LAYOUT, "   ", 2000);

    expect(saved).toEqual([original]);
  });
});
