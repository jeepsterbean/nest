import { describe, expect, it, vi } from "vitest";
import { readMigratedStorageValue } from "../../src/lib/storageKeyMigration";

describe("readMigratedStorageValue", () => {
  it("moves a legacy value to the current key", () => {
    const values = new Map([["nest.legacy", "saved"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: (key: string, value: string) => values.set(key, value),
      removeItem: (key: string) => values.delete(key),
    };

    expect(readMigratedStorageValue(storage, "nest:current", "nest.legacy"))
      .toBe("saved");
    expect(values.get("nest:current")).toBe("saved");
    expect(values.has("nest.legacy")).toBe(false);
  });

  it("keeps the current value authoritative and removes a stale legacy value", () => {
    const values = new Map([
      ["nest:current", "current"],
      ["nest.legacy", "legacy"],
    ]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: vi.fn(),
      removeItem: (key: string) => values.delete(key),
    };

    expect(readMigratedStorageValue(storage, "nest:current", "nest.legacy"))
      .toBe("current");
    expect(storage.setItem).not.toHaveBeenCalled();
    expect(values.has("nest.legacy")).toBe(false);
  });

  it("preserves the legacy value when the migration write fails", () => {
    const values = new Map([["nest.legacy", "saved"]]);
    const storage = {
      getItem: (key: string) => values.get(key) ?? null,
      setItem: () => {
        throw new Error("storage unavailable");
      },
      removeItem: vi.fn(),
    };

    expect(readMigratedStorageValue(storage, "nest:current", "nest.legacy"))
      .toBe("saved");
    expect(values.get("nest.legacy")).toBe("saved");
    expect(storage.removeItem).not.toHaveBeenCalled();
  });
});
