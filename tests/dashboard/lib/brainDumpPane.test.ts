import { describe, expect, it } from "vitest";
import {
  readBrainDumpPane,
  writeBrainDumpPane,
} from "../../../src/dashboard/lib/brainDumpPane";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("brain dump pane", () => {
  it("defaults to History and restores the last saved pane", () => {
    const storage = memory();
    expect(readBrainDumpPane(storage)).toBe("history");
    writeBrainDumpPane("tags", storage);
    expect(readBrainDumpPane(storage)).toBe("tags");
    writeBrainDumpPane("history", storage);
    expect(readBrainDumpPane(storage)).toBe("history");
  });

  it("falls back to History for an unknown stored pane", () => {
    const storage = memory();
    storage.setItem("nest:brain-dump-pane", "settings");
    expect(readBrainDumpPane(storage)).toBe("history");
  });
});
