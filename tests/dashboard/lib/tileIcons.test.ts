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

  it("keeps saved choices, and ignores unknown icons and retired ids", () => {
    const storage = memory();
    storage.setItem(
      "nest:overview-tile-icons",
      JSON.stringify({
        overview: "sun",
        assistant: "moon",
        timeline: "calendar",
        tasks: "unknown",
        notes: 42,
        metrics: "heart",
      }),
    );
    expect(readTileIcons(storage)).toEqual({
      ...DEFAULT_TILE_ICONS,
      metrics: "heart",
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

  it("writes the Phases Section icon", () => {
    const storage = memory();
    writeTileIcon("phases", "moon", storage);
    expect(readTileIcons(storage)).toEqual({
      ...DEFAULT_TILE_ICONS,
      phases: "moon",
    });
  });

  it("writes a Section icon and keeps the others", () => {
    const storage = memory();
    writeTileIcon("recap", "sun", storage);
    expect(readTileIcons(storage)).toEqual({
      ...DEFAULT_TILE_ICONS,
      recap: "sun",
    });
  });

  it("carries over the Recap icon saved when the Section was named Calendar", () => {
    const storage = memory();
    storage.setItem(
      "nest:overview-tile-icons",
      JSON.stringify({ calendar: "sun" }),
    );
    expect(readTileIcons(storage).recap).toBe("sun");

    writeTileIcon("recap", "moon", storage);
    expect(readTileIcons(storage).recap).toBe("moon");
  });

  it("carries over the Notes icon saved when the Section was named Brain dump", () => {
    const storage = memory();
    storage.setItem(
      "nest:overview-tile-icons",
      JSON.stringify({ brainDump: "brain" }),
    );
    expect(readTileIcons(storage).notes).toBe("brain");

    writeTileIcon("notes", "idea", storage);
    expect(readTileIcons(storage).notes).toBe("idea");
  });
});
