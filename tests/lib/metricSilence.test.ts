import { describe, expect, it } from "vitest";
import {
  readSilencedMetricIds,
  silenceMetric,
  silenceUntil,
} from "../../src/lib/metricSilence";

const storageOf = (value: { current: string | null }) => ({
  getItem: () => value.current,
  setItem: (_key: string, next: string) => {
    value.current = next;
  },
});

describe("metric silence", () => {
  it("lasts for the Metric check-in interval from now", () => {
    expect(silenceUntil(15, 1_000_000)).toBe(1_000 + 15 * 60);
  });

  it("skips a Metric until the timestamp, then returns it", () => {
    const value = { current: null as string | null };
    const storage = storageOf(value);
    silenceMetric(3, 50, 40_000, storage);

    expect([...readSilencedMetricIds(49_000, storage)]).toEqual([3]);
    expect([...readSilencedMetricIds(50_000, storage)]).toEqual([]);
  });

  it("drops expired Silence when another Metric is silenced", () => {
    const value = { current: null as string | null };
    const storage = storageOf(value);
    silenceMetric(1, 50, 40_000, storage);
    silenceMetric(2, 80, 50_000, storage);

    expect([...readSilencedMetricIds(50_000, storage)]).toEqual([2]);
  });

  it("ignores unreadable storage", () => {
    const storage = storageOf({ current: "not-json" });
    expect([...readSilencedMetricIds(0, storage)]).toEqual([]);
  });
});
