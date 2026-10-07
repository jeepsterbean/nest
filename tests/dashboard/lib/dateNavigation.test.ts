import { describe, expect, it } from "vitest";
import { boundedDayMs, selectedDayMs, stepSelectedDay } from "../../../src/dashboard/lib/dateNavigation";
import { shiftDayMs, startOfDayMs } from "../../../src/dashboard/lib/time";

const nowMs = new Date(2026, 9, 7, 12).getTime();
const todayMs = startOfDayMs(nowMs / 1000);

describe("date navigation bounds", () => {
  it("caps direct future selections and respects loaded history", () => {
    const earliestMs = shiftDayMs(todayMs, -30);
    expect(boundedDayMs(shiftDayMs(todayMs, 10), nowMs, earliestMs / 1000)).toBe(todayMs);
    expect(boundedDayMs(shiftDayMs(todayMs, -40), nowMs, earliestMs / 1000)).toBe(earliestMs);
    expect(boundedDayMs(shiftDayMs(todayMs, -40), nowMs)).toBe(shiftDayMs(todayMs, -40));
  });

  it("keeps past dates fixed at midnight while Today follows the clock", () => {
    const yesterdayMs = shiftDayMs(todayMs, -1);
    const tomorrowMs = shiftDayMs(todayMs, 1);
    expect(selectedDayMs(yesterdayMs, tomorrowMs)).toBe(yesterdayMs);
    expect(selectedDayMs(null, tomorrowMs)).toBe(tomorrowMs);
  });

  it("caps day and week steps at Today and resumes following Today on return", () => {
    expect(stepSelectedDay(null, 1, nowMs)).toBeNull();
    expect(stepSelectedDay(null, -1, nowMs)).toBe(shiftDayMs(todayMs, -1));
    expect(stepSelectedDay(shiftDayMs(todayMs, -1), 1, nowMs)).toBeNull();
    expect(stepSelectedDay(shiftDayMs(todayMs, -3), 7, nowMs)).toBeNull();
  });
});
