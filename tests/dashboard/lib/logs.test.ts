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
  it("defaults to Raw", () => {
    expect(readLogsPreferences(memory())).toEqual({ view: "raw" });
  });

  it("round-trips the selected Logs view", () => {
    const storage = memory();
    writeLogsPreferences({ view: "timeline" }, storage);
    expect(readLogsPreferences(storage)).toEqual({ view: "timeline" });
  });

  it("migrates legacy layout and filter onto a single view", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "timeline",
        rawFilter: "phases",
        phaseMode: "raw",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "timeline" });

    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "raw",
        rawFilter: "dumps",
        phaseMode: "aggregated",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "dumps" });

    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({
        layout: "raw",
        rawFilter: "all",
        phaseMode: "aggregated",
      }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
  });

  it("falls back when the stored view is invalid", () => {
    const storage = memory();
    storage.setItem(
      "nest:logs-preferences",
      JSON.stringify({ view: "cards" }),
    );
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
  });

  it("recovers from malformed storage", () => {
    const storage = memory();
    storage.setItem("nest:logs-preferences", "{");
    expect(readLogsPreferences(storage)).toEqual({ view: "raw" });
  });
});
