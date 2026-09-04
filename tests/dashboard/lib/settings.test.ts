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
  it("defaults to Metrics and restores the last saved pane", () => {
    const storage = memory();
    expect(readSettingsPane(storage)).toBe("metrics");
    writeSettingsPane("phases", storage);
    expect(readSettingsPane(storage)).toBe("phases");
    writeSettingsPane("tags", storage);
    expect(readSettingsPane(storage)).toBe("tags");
  });

  it("falls back to Metrics for an unknown stored pane", () => {
    const storage = memory();
    storage.setItem("nest:settings-pane", "scopes");
    expect(readSettingsPane(storage)).toBe("metrics");
  });
});
