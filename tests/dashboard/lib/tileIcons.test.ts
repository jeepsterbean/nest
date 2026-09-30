import { describe, expect, it } from "vitest";
import {
  DEFAULT_TILE_ICONS,
  readTileIcons,
  writeTileIcon,
} from "../../../src/dashboard/lib/tileIcons";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("tile icons", () => {
  it("returns the defaults when storage is empty", () => {
    const storage = memory();
    expect(readTileIcons(storage)).toEqual(DEFAULT_TILE_ICONS);
  });

  it("preserves the fixed Insights icon and falls back for unknown choices", () => {
    const storage = memory();
    storage.setItem(
      "nest:overview-tile-icons",
      JSON.stringify({
        lastHour: "timer",
        tasks: "unknown",
        timeline: "calendar",
        brainDump: 42,
        metrics: "gauge",
      }),
    );
    expect(readTileIcons(storage)).toEqual({
      overview: DEFAULT_TILE_ICONS.overview,
      lastHour: "insights",
      tasks: DEFAULT_TILE_ICONS.tasks,
      timeline: "calendar",
      brainDump: DEFAULT_TILE_ICONS.brainDump,
      metrics: "gauge",
      controlPanel: DEFAULT_TILE_ICONS.controlPanel,
    });
  });

  it("writes one tile icon and keeps the others", () => {
    const storage = memory();
    writeTileIcon("tasks", "heart", storage);
    expect(readTileIcons(storage)).toEqual({
      ...DEFAULT_TILE_ICONS,
      tasks: "heart",
    });
  });
});
