import { describe, expect, it } from "vitest";
import {
  formatTaskDateDay,
  matchingTaskDatePreset,
  resolveTaskDateFilter,
  taskDateFilterCalendarRange,
  taskDateFilterInputValues,
  taskDateFilterLabel,
  taskMatchesDateFilter,
} from "../../../src/dashboard/lib/taskDateFilter";

declare const process: { env: Record<string, string | undefined> };

const sec = (d: Date) => Math.floor(d.getTime() / 1000);

const at = (year: number, month: number, day: number, hours = 0, minutes = 0) =>
  sec(new Date(year, month, day, hours, minutes));

describe("resolveTaskDateFilter", () => {
  // Wednesday, so This week and Last 7 days are different windows.
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("leaves a null filter unresolved", () => {
    expect(resolveTaskDateFilter(null, nowMs)).toBeNull();
    expect(resolveTaskDateFilter({ kind: "range", fromDay: null, toDay: null }, nowMs)).toBeNull();
  });

  it("resolves Today to local midnight through tomorrow", () => {
    expect(resolveTaskDateFilter({ kind: "preset", preset: "today" }, nowMs)).toEqual({
      fromSec: at(2026, 5, 17),
      toSec: at(2026, 5, 18),
    });
  });

  it("starts This week on Monday", () => {
    expect(resolveTaskDateFilter({ kind: "preset", preset: "this_week" }, nowMs)).toEqual({
      fromSec: at(2026, 5, 15),
      toSec: at(2026, 5, 22),
    });
  });

  it("resolves This month to the whole calendar month", () => {
    expect(resolveTaskDateFilter({ kind: "preset", preset: "this_month" }, nowMs)).toEqual({
      fromSec: at(2026, 5, 1),
      toSec: at(2026, 6, 1),
    });
  });

  it("includes today in Last 7 and Last 30 days", () => {
    expect(resolveTaskDateFilter({ kind: "preset", preset: "last_7" }, nowMs)).toEqual({
      fromSec: at(2026, 5, 11),
      toSec: at(2026, 5, 18),
    });
    expect(resolveTaskDateFilter({ kind: "preset", preset: "last_30" }, nowMs)).toEqual({
      fromSec: at(2026, 4, 19),
      toSec: at(2026, 5, 18),
    });
  });

  it("keeps one-sided custom ranges open on the unset side", () => {
    expect(resolveTaskDateFilter({ kind: "range", fromDay: "2026-06-10", toDay: null }, nowMs)).toEqual({
      fromSec: at(2026, 5, 10),
      toSec: null,
    });
    expect(resolveTaskDateFilter({ kind: "range", fromDay: null, toDay: "2026-06-10" }, nowMs)).toEqual({
      fromSec: null,
      toSec: at(2026, 5, 11),
    });
  });

  it("swaps a reversed from/to so both picked days stay included", () => {
    expect(resolveTaskDateFilter({ kind: "range", fromDay: "2026-06-12", toDay: "2026-06-08" }, nowMs)).toEqual({
      fromSec: at(2026, 5, 8),
      toSec: at(2026, 5, 13),
    });
  });

  it("ignores an incomplete rolled date", () => {
    expect(resolveTaskDateFilter({ kind: "range", fromDay: "2026-02-31", toDay: null }, nowMs)).toBeNull();
  });
});

describe("taskMatchesDateFilter", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("keeps every timestamp when no filter is set", () => {
    expect(taskMatchesDateFilter(at(1999, 0, 1), null, nowMs)).toBe(true);
  });

  it("uses a half-open window, inclusive of the start midnight", () => {
    const today = { kind: "preset" as const, preset: "today" as const };
    expect(taskMatchesDateFilter(at(2026, 5, 17), today, nowMs)).toBe(true);
    expect(taskMatchesDateFilter(at(2026, 5, 17, 23, 59), today, nowMs)).toBe(true);
    expect(taskMatchesDateFilter(at(2026, 5, 18), today, nowMs)).toBe(false);
    expect(taskMatchesDateFilter(at(2026, 5, 16, 23, 59), today, nowMs)).toBe(false);
  });
});

describe("matchingTaskDatePreset", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("keeps the stored preset even when another window would also match", () => {
    expect(matchingTaskDatePreset({ kind: "preset", preset: "last_7" }, nowMs)).toBe("last_7");
  });

  it("treats a custom range that equals Today as Today", () => {
    expect(
      matchingTaskDatePreset({ kind: "range", fromDay: "2026-06-17", toDay: "2026-06-17" }, nowMs),
    ).toBe("today");
  });

  it("leaves a one-sided range unmatched", () => {
    expect(
      matchingTaskDatePreset({ kind: "range", fromDay: "2026-06-17", toDay: null }, nowMs),
    ).toBeNull();
  });
});

describe("taskDateFilterLabel", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("uses the preset name", () => {
    expect(taskDateFilterLabel({ kind: "preset", preset: "this_week" }, nowMs)).toBe("This week");
    expect(taskDateFilterLabel({ kind: "range", fromDay: "2026-06-17", toDay: "2026-06-17" }, nowMs)).toBe("Today");
  });

  it("labels one-sided ranges and includes a year that is not this year", () => {
    expect(taskDateFilterLabel({ kind: "range", fromDay: "2026-06-08", toDay: null }, nowMs)).toMatch(/^Since /);
    expect(taskDateFilterLabel({ kind: "range", fromDay: null, toDay: "2026-06-08" }, nowMs)).toMatch(/^Through /);
    expect(taskDateFilterLabel({ kind: "range", fromDay: "2025-12-01", toDay: null }, nowMs)).toContain("2025");
    expect(taskDateFilterLabel({ kind: "range", fromDay: "2026-06-01", toDay: "2026-06-08" }, nowMs)).toContain("–");
  });
});

describe("taskDateFilterInputValues", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("fills inclusive days from a preset window", () => {
    expect(taskDateFilterInputValues({ kind: "preset", preset: "today" }, nowMs)).toEqual({
      fromDay: "2026-06-17",
      toDay: "2026-06-17",
    });
    expect(taskDateFilterInputValues({ kind: "preset", preset: "this_week" }, nowMs)).toEqual({
      fromDay: "2026-06-15",
      toDay: "2026-06-21",
    });
  });
});

describe("formatTaskDateDay", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("omits this year and keeps another year", () => {
    expect(formatTaskDateDay("2026-06-08", nowMs)).not.toMatch(/2026/);
    expect(formatTaskDateDay("2025-12-01", nowMs)).toContain("2025");
  });

  it("returns empty for an incomplete day", () => {
    expect(formatTaskDateDay("", nowMs)).toBe("");
    expect(formatTaskDateDay("2026-02-31", nowMs)).toBe("");
  });
});

describe("taskDateFilterCalendarRange", () => {
  const nowMs = new Date(2026, 5, 17, 14, 30).getTime();

  it("uses an empty today range when nothing is selected, so the month opens on today", () => {
    expect(taskDateFilterCalendarRange(null, nowMs)).toEqual({
      from: at(2026, 5, 17),
      to: at(2026, 5, 17),
    });
  });

  it("paints a preset window and a one-sided custom day", () => {
    expect(taskDateFilterCalendarRange({ kind: "preset", preset: "today" }, nowMs)).toEqual({
      from: at(2026, 5, 17),
      to: at(2026, 5, 18),
    });
    expect(taskDateFilterCalendarRange({ kind: "range", fromDay: "2026-06-08", toDay: null }, nowMs)).toEqual({
      from: at(2026, 5, 8),
      to: at(2026, 5, 9),
    });
    expect(taskDateFilterCalendarRange({ kind: "range", fromDay: null, toDay: "2026-06-08" }, nowMs)).toEqual({
      from: at(2026, 5, 8),
      to: at(2026, 5, 9),
    });
  });
});

describe("DST spring-forward", () => {
  it("still lands on local midnights across a 23-hour day", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "America/New_York";
    try {
      // 2026-03-08 is the US spring-forward Sunday.
      const nowMs = new Date(2026, 2, 8, 14, 30).getTime();
      expect(resolveTaskDateFilter({ kind: "preset", preset: "today" }, nowMs)).toEqual({
        fromSec: at(2026, 2, 8),
        toSec: at(2026, 2, 9),
      });
      expect(resolveTaskDateFilter({ kind: "preset", preset: "last_7" }, nowMs)).toEqual({
        fromSec: at(2026, 2, 2),
        toSec: at(2026, 2, 9),
      });
      expect(taskMatchesDateFilter(at(2026, 2, 8, 3, 0), { kind: "preset", preset: "today" }, nowMs)).toBe(true);
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });
});
