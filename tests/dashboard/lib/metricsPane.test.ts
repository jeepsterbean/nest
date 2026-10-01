import { describe, expect, it } from "vitest";
import {
  readMetricsPane,
  writeMetricsPane,
} from "../../../src/dashboard/lib/metricsPane";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("metrics pane", () => {
  it("defaults to Pulses and restores the last saved pane", () => {
    const storage = memory();
    expect(readMetricsPane(storage)).toBe("pulses");
    writeMetricsPane("all", storage);
    expect(readMetricsPane(storage)).toBe("all");
    writeMetricsPane("pulses", storage);
    expect(readMetricsPane(storage)).toBe("pulses");
  });

  it("falls back to Pulses for an unknown stored pane", () => {
    const storage = memory();
    storage.setItem("nest:metrics-pane", "settings");
    expect(readMetricsPane(storage)).toBe("pulses");
  });
});
