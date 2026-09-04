import { describe, expect, it } from "vitest";
import { readMetricDueHeld, writeMetricDueHeld } from "../../src/lib/metricDue";

describe("metric due latch storage", () => {
  it("survives a remount-style read after the timer is no longer due", () => {
    let value: string | null = null;
    const storage = {
      getItem: () => value,
      setItem: (_key: string, next: string) => {
        value = next;
      },
      removeItem: () => {
        value = null;
      },
    };

    expect(readMetricDueHeld(storage)).toBe(false);
    writeMetricDueHeld(true, storage);
    expect(readMetricDueHeld(storage)).toBe(true);
    writeMetricDueHeld(false, storage);
    expect(readMetricDueHeld(storage)).toBe(false);
  });
});
