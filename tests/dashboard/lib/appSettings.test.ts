import { describe, expect, it } from "vitest";
import {
  DEFAULT_APP_SETTINGS,
  readAppSettings,
  writeAppSettings,
} from "../../../src/dashboard/lib/appSettings";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("app settings", () => {
  it("hides Map and keeps icon selection until a choice is saved", () => {
    expect(readAppSettings(memory())).toEqual(DEFAULT_APP_SETTINGS);
  });

  it("saves one field and keeps the other", () => {
    const storage = memory();
    writeAppSettings({ showTaskMap: true }, storage);
    expect(readAppSettings(storage)).toEqual({
      showTaskMap: true,
      iconSelection: true,
    });
    writeAppSettings({ iconSelection: false }, storage);
    expect(readAppSettings(storage)).toEqual({
      showTaskMap: true,
      iconSelection: false,
    });
  });

  it("falls back per field when the stored value is unusable", () => {
    const storage = memory();
    storage.setItem("nest:settings", "{oops");
    expect(readAppSettings(storage)).toEqual(DEFAULT_APP_SETTINGS);
    storage.setItem("nest:settings", JSON.stringify({ showTaskMap: "yes", iconSelection: false }));
    expect(readAppSettings(storage)).toEqual({
      showTaskMap: false,
      iconSelection: false,
    });
  });
});
