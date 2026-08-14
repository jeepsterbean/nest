import { describe, expect, it } from "vitest";
import {
  computeStreak,
  dayLabel,
  elapsedMinutes,
  formatCheckInCountdown,
  formatDate,
  formatDateTime,
  formatElapsedMinutes,
  formatTime,
  formatWorkedTime,
  greetingForHour,
  previousDayMs,
  startOfDayMs,
  taskTotalWorkedSeconds,
  taskWorkSessionSeconds,
} from "../../../src/dashboard/lib/time";

// All day-boundary math is in local time (setHours), so expectations are built
// with the local Date constructor to stay timezone-independent.
const sec = (d: Date) => Math.floor(d.getTime() / 1000);

describe("startOfDayMs", () => {
  it("returns local midnight of the given timestamp", () => {
    const ts = sec(new Date(2026, 5, 17, 14, 30, 45));
    expect(startOfDayMs(ts)).toBe(new Date(2026, 5, 17, 0, 0, 0, 0).getTime());
  });

  it("collapses two times on the same calendar day to the same value", () => {
    const morning = sec(new Date(2026, 5, 17, 0, 1));
    const evening = sec(new Date(2026, 5, 17, 23, 59));
    expect(startOfDayMs(morning)).toBe(startOfDayMs(evening));
  });
});

describe("previousDayMs", () => {
  it("steps back one calendar day", () => {
    const today = new Date(2026, 5, 17, 0, 0, 0, 0).getTime();
    expect(previousDayMs(today)).toBe(new Date(2026, 5, 16).getTime());
  });

  it("crosses a month boundary (Mar 1 -> Feb 28 in a non-leap year)", () => {
    const mar1 = new Date(2026, 2, 1, 0, 0, 0, 0).getTime();
    expect(previousDayMs(mar1)).toBe(new Date(2026, 1, 28).getTime());
  });
});

describe("dayLabel", () => {
  const now = new Date(2026, 5, 17, 10, 0, 0).getTime();

  it("labels the same day as Today", () => {
    expect(dayLabel(sec(new Date(2026, 5, 17, 8, 0)), now)).toBe("Today");
  });

  it("labels the prior day as Yesterday", () => {
    expect(dayLabel(sec(new Date(2026, 5, 16, 23, 0)), now)).toBe("Yesterday");
  });

  it("labels older days as neither Today nor Yesterday", () => {
    const label = dayLabel(sec(new Date(2026, 5, 10, 12, 0)), now);
    expect(label).not.toBe("Today");
    expect(label).not.toBe("Yesterday");
  });
});

describe("computeStreak", () => {
  const now = new Date(2026, 5, 17, 12, 0, 0).getTime();
  const onDay = (day: number) => sec(new Date(2026, 5, day, 9, 0));

  it("returns 0 with no events", () => {
    expect(computeStreak([], now)).toBe(0);
  });

  it("counts a single entry today as 1", () => {
    expect(computeStreak([onDay(17)], now)).toBe(1);
  });

  it("counts today + yesterday as 2", () => {
    expect(computeStreak([onDay(17), onDay(16)], now)).toBe(2);
  });

  it("stops at a gap", () => {
    expect(computeStreak([onDay(17), onDay(15)], now)).toBe(1);
  });

  it("counts from yesterday when today has no entry yet", () => {
    expect(computeStreak([onDay(16), onDay(15)], now)).toBe(2);
  });

  it("counts multiple entries on the same day once", () => {
    expect(computeStreak([onDay(17), onDay(17)], now)).toBe(1);
  });
});

describe("greetingForHour", () => {
  it("maps hours to greetings", () => {
    expect(greetingForHour(2)).toBe("Up late");
    expect(greetingForHour(9)).toBe("Good morning");
    expect(greetingForHour(14)).toBe("Good afternoon");
    expect(greetingForHour(20)).toBe("Good evening");
  });
});

describe("format helpers", () => {
  it("renders an em dash for a null date", () => {
    expect(formatDate(null)).toBe("—");
  });

  it("does not throw for valid timestamps", () => {
    const ts = sec(new Date(2026, 5, 17, 14, 30));
    expect(typeof formatTime(ts)).toBe("string");
    expect(typeof formatDate(ts)).toBe("string");
    expect(typeof formatDateTime(ts)).toBe("string");
  });
});

describe("minute helpers", () => {
  const now = new Date(2026, 5, 17, 14, 30, 30).getTime();

  it("formats elapsed whole minutes without going negative", () => {
    expect(elapsedMinutes(sec(new Date(2026, 5, 17, 14, 25)), now)).toBe(5);
    expect(formatElapsedMinutes(sec(new Date(2026, 5, 17, 14, 25)), now)).toBe(
      "5 min",
    );
    expect(elapsedMinutes(sec(new Date(2026, 5, 17, 14, 31)), now)).toBe(0);
  });

  it("shows second-precision countdowns and marks due schedules", () => {
    expect(
      formatCheckInCountdown(sec(new Date(2026, 5, 17, 14, 31)), now),
    ).toBe("0:30");
    expect(
      formatCheckInCountdown(sec(new Date(2026, 5, 17, 14, 32, 5)), now),
    ).toBe("1:35");
    expect(
      formatCheckInCountdown(sec(new Date(2026, 5, 17, 14, 30)), now),
    ).toBe("0:00");
  });
});

describe("worked time", () => {
  it("starts each visible session at zero without going backwards", () => {
    expect(taskWorkSessionSeconds(100, 130_000)).toBe(30);
    expect(taskWorkSessionSeconds(130, 130_000)).toBe(0);
    expect(taskWorkSessionSeconds(140, 130_000)).toBe(0);
    expect(taskWorkSessionSeconds(null, 130_000)).toBe(0);
  });

  it("keeps the running session available for lifetime totals", () => {
    expect(taskTotalWorkedSeconds(90, 100, 130_000)).toBe(120);
    expect(taskTotalWorkedSeconds(90, null, 130_000)).toBe(90);
  });

  it("formats stopwatch time", () => {
    expect(formatWorkedTime(0)).toBe("0");
    expect(formatWorkedTime(45)).toBe("45");
    expect(formatWorkedTime(60)).toBe("1:00");
    expect(formatWorkedTime(330)).toBe("5:30");
    expect(formatWorkedTime(3_661)).toBe("1:01:01");
  });
});
