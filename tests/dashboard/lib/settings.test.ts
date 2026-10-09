import { describe, expect, it } from "vitest";
import {
  readSettingsPane,
  writeSettingsPane,
} from "../../../src/dashboard/lib/settings";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("settings pane", () => {
  it("defaults to Assistant and restores the last saved pane", () => {
    const storage = memory();
    expect(readSettingsPane(storage)).toBe("assistant");
    writeSettingsPane("background", storage);
    expect(readSettingsPane(storage)).toBe("background");
    writeSettingsPane("reminders", storage);
    expect(readSettingsPane(storage)).toBe("reminders");
  });

  it("falls back to Assistant for an unknown stored pane", () => {
    const storage = memory();
    storage.setItem("nest:settings-pane", "scopes");
    expect(readSettingsPane(storage)).toBe("assistant");
  });

  it("falls back to Assistant for panes that moved into their Sections", () => {
    const storage = memory();
    for (const moved of ["metrics", "phases", "tags", "brainDump", "timeline", "tasks", "lastHour", "controlPanel"]) {
      storage.setItem("nest:settings-pane", moved);
      expect(readSettingsPane(storage)).toBe("assistant");
    }
  });
});
