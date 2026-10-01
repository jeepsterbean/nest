import { describe, expect, it } from "vitest";
import { readCorePane, writeCorePane } from "../../../src/dashboard/lib/corePane";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("core pane", () => {
  it("defaults to Brain dump and restores the last saved pane", () => {
    const storage = memory();
    expect(readCorePane(storage)).toBe("brainDump");
    writeCorePane("tasks", storage);
    expect(readCorePane(storage)).toBe("tasks");
    writeCorePane("metrics", storage);
    expect(readCorePane(storage)).toBe("metrics");
    writeCorePane("phases", storage);
    expect(readCorePane(storage)).toBe("phases");
  });

  it("falls back to Brain dump for an unknown stored pane", () => {
    const storage = memory();
    storage.setItem("nest:core-pane", "logs");
    expect(readCorePane(storage)).toBe("brainDump");
  });
});
