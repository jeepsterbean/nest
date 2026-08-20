import { describe, expect, it } from "vitest";
import {
  readLogsPreferences,
  writeLogsPreferences,
} from "../../../src/dashboard/lib/logs";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

describe("Logs preferences", () => {
  it("defaults to Raw, All, and Aggregated", () => {
    expect(readLogsPreferences(memory())).toEqual({
      layout: "raw",
      rawFilter: "all",
      phaseMode: "aggregated",
    });
  });

  it("round-trips the selected Logs controls", () => {
    const storage = memory();
    const preferences = {
      layout: "timeline" as const,
      rawFilter: "phases" as const,
      phaseMode: "raw" as const,
    };
    writeLogsPreferences(preferences, storage);
    expect(readLogsPreferences(storage)).toEqual(preferences);
  });

  it("falls back field-by-field when stored values are invalid", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "cards",
        rawFilter: "metrics",
        phaseMode: "settled",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({
      layout: "raw",
      rawFilter: "metrics",
      phaseMode: "aggregated",
    });
  });

  it("recovers from malformed storage", () => {
    const storage = memory();
    storage.setItem("nest:logs-preferences", "{");
    expect(readLogsPreferences(storage)).toEqual({
      layout: "raw",
      rawFilter: "all",
      phaseMode: "aggregated",
    });
  });
});
