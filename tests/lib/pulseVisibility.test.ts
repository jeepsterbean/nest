import { describe, expect, it } from "vitest";
import {
  readHiddenPulseIds,
  setPulseVisible,
} from "../../src/lib/pulseVisibility";

describe("pulse visibility", () => {
  it("defaults pulses on and persists only hidden IDs", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
    };

    expect([...readHiddenPulseIds(storage)]).toEqual([]);
    expect([...setPulseVisible(2, false, storage)]).toEqual([2]);
    expect([...setPulseVisible(2, true, storage)]).toEqual([]);
  });
});
