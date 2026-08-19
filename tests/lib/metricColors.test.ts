import { describe, expect, it } from "vitest";
import { METRIC_COLOR_PRESETS, resolveMetricColor, resolveMetricColorFromList } from "../../src/lib/metricColors";
import type { Metric } from "../../src/lib/types";

const metric = (overrides: Partial<Metric> = {}): Metric => ({
  id: 1,
  name: "Energy",
  icon: "activity",
  createdAt: 0,
  color: null,
  ...overrides,
});

describe("resolveMetricColor", () => {
  it("uses the stored color when set", () => {
    expect(resolveMetricColor(metric({ color: "#4a7dd1" }), 0)).toBe("#4a7dd1");
  });

  it("falls back to palette by index when color is null", () => {
    expect(resolveMetricColor(metric(), 0)).toBe("var(--accent)");
    expect(resolveMetricColor(metric(), 3)).toBe("var(--dump)");
  });

  it("resolves color from the metrics list by id", () => {
    const metrics = [
      metric({ id: 1, color: "#4a7dd1" }),
      metric({ id: 2, color: null }),
    ];
    expect(resolveMetricColorFromList(metrics, 1)).toBe("#4a7dd1");
    expect(resolveMetricColorFromList(metrics, 2)).toBe("var(--phase)");
  });

  it("exposes enough preset colors for manual selection", () => {
    expect(METRIC_COLOR_PRESETS.length).toBeGreaterThanOrEqual(8);
  });
});
