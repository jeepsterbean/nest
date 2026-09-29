import { describe, expect, it } from "vitest";
import {
  canShowEarlierMonth,
  canShowLaterMonth,
  dayPickerWeeks,
  shiftMonthMs,
  startOfMonthMs,
} from "../../../src/dashboard/lib/dayPicker";

const at = (month: number, day: number, hour = 0) =>
  new Date(2026, month, day, hour).getTime();
const sec = (ms: number) => Math.floor(ms / 1000);

// Tuesday 29 September 2026, with history reaching back to 30 August.
const nowMs = at(8, 29, 15);
const earliestSec = sec(at(7, 30));
const selectedDay = { from: sec(at(8, 22)), to: sec(at(8, 23)) };

describe("day picker month", () => {
  const weeks = dayPickerWeeks(at(8, 1), {
    earliestSec,
    nowMs,
    selected: selectedDay,
  });
  const cells = weeks.flat();
  const cell = (month: number, day: number) =>
    cells.find((candidate) => candidate.dayMs === at(month, day))!;

  it("lays out whole Monday-first weeks around the month", () => {
    expect(weeks.every((week) => week.length === 7)).toBe(true);
    expect(new Date(weeks[0][0].dayMs).getDay()).toBe(1);
    expect(weeks[0][0].dayMs).toBe(at(7, 31));
    expect(cell(7, 31).inMonth).toBe(false);
    expect(cell(8, 30).inMonth).toBe(true);
    expect(weeks[weeks.length - 1][6].dayMs).toBe(at(9, 4));
  });

  it("only lets loaded, past-or-today days be picked", () => {
    expect(cell(7, 31).isPickable).toBe(true);
    expect(cell(8, 29).isPickable).toBe(true);
    expect(cell(8, 30).isPickable).toBe(false);
    const august = dayPickerWeeks(at(7, 1), {
      earliestSec,
      nowMs,
      selected: selectedDay,
    }).flat();
    expect(august.find((c) => c.dayMs === at(7, 29))!.isPickable).toBe(false);
    expect(august.find((c) => c.dayMs === at(7, 30))!.isPickable).toBe(true);
  });

  it("marks today and every day of the range on screen", () => {
    expect(cell(8, 29).isToday).toBe(true);
    expect(cells.filter((c) => c.isSelected).map((c) => c.dayMs)).toEqual([
      at(8, 22),
    ]);
    const week = dayPickerWeeks(at(8, 1), {
      earliestSec,
      nowMs,
      selected: { from: sec(at(8, 21)), to: sec(at(8, 28)) },
    }).flat();
    expect(week.filter((c) => c.isSelected)).toHaveLength(7);
  });

  it("pages months only as far as history and today reach", () => {
    expect(startOfMonthMs(at(8, 17))).toBe(at(8, 1));
    expect(shiftMonthMs(at(0, 1), -1)).toBe(new Date(2025, 11, 1).getTime());
    expect(canShowEarlierMonth(at(8, 1), earliestSec)).toBe(true);
    expect(canShowEarlierMonth(at(7, 1), earliestSec)).toBe(false);
    expect(canShowLaterMonth(at(8, 1), nowMs)).toBe(false);
    expect(canShowLaterMonth(at(7, 1), nowMs)).toBe(true);
  });
});
