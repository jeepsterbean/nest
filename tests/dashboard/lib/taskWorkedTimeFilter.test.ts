import { describe, expect, it } from "vitest";
import {
  nearestWorkedTimeStopIndex,
  normalizeWorkedTimeFilter,
  roundWorkedSecondsToMinute,
  taskMatchesWorkedTimeFilter,
  taskWorkedTimeFilterLabel,
  workedTimeStops,
} from "../../../src/dashboard/lib/taskWorkedTimeFilter";

const task = (fields: { workedSeconds: number; workStartedAt: number | null; workingNow: boolean }) => fields;

describe("taskWorkedTimeFilter", () => {
  it("floors live seconds to whole minutes for stops", () => {
    expect(roundWorkedSecondsToMinute(0)).toBe(0);
    expect(roundWorkedSecondsToMinute(59)).toBe(0);
    expect(roundWorkedSecondsToMinute(60)).toBe(60);
    expect(roundWorkedSecondsToMinute(32 * 60 + 7)).toBe(32 * 60);
    expect(workedTimeStops([59, 60, 120, 120])).toEqual([0, 60, 120]);
  });

  it("keeps the ends when thinning a long unique list", () => {
    const seconds = Array.from({ length: 40 }, (_, index) => index * 60);
    const stops = workedTimeStops(seconds, 5);
    expect(stops[0]).toBe(0);
    expect(stops[stops.length - 1]).toBe(39 * 60);
    expect(stops.length).toBeLessThanOrEqual(5);
  });

  it("matches the displayed total, inclusive of the chosen minute", () => {
    const nowMs = 1_700_000_000_000;
    const working = task({
      workedSeconds: 20 * 60,
      workingNow: true,
      workStartedAt: nowMs / 1000 - (12 * 60 + 7),
    });
    expect(taskMatchesWorkedTimeFilter(working, { comparator: "more", seconds: 32 * 60 }, nowMs)).toBe(true);
    expect(taskMatchesWorkedTimeFilter(working, { comparator: "more", seconds: 33 * 60 }, nowMs)).toBe(false);
    expect(taskMatchesWorkedTimeFilter(working, { comparator: "less", seconds: 32 * 60 }, nowMs)).toBe(true);
    expect(taskWorkedTimeFilterLabel({ comparator: "more", seconds: 32 * 60 })).toBe("More than 32m");
  });

  it("snaps a saved threshold onto the nearest stop", () => {
    expect(nearestWorkedTimeStopIndex([0, 60, 3600], 70)).toBe(1);
    expect(nearestWorkedTimeStopIndex([0, 60, 3600], 4000)).toBe(2);
  });

  it("rejects incomplete stored filters", () => {
    expect(normalizeWorkedTimeFilter({ comparator: "more", seconds: 90 })).toEqual({ comparator: "more", seconds: 90 });
    expect(normalizeWorkedTimeFilter({ comparator: "around", seconds: 90 })).toBeNull();
    expect(normalizeWorkedTimeFilter({ comparator: "less", seconds: -1 })).toBeNull();
  });
});
