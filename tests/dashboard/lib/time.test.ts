import { describe, expect, it } from "vitest";
import {
  dayLabel,
  formatClockedTime,
  formatTimerCountdown,
  formatCompactDuration,
  formatDate,
  formatHourTick,
  formatTime,
  formatWorkedTime,
  greetingForHour,
  historyStartSec,
  isTimerDue,
  shiftDayMs,
  snapToQuarterHour,
  startOfDayMs,
  taskWorkSessionSeconds,
  toDateInput,
  toTimeInput,
  fromDateAndTime,
} from "../../../src/dashboard/lib/time";

declare const process: { env: Record<string, string | undefined> };

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

describe("shiftDayMs", () => {
  it("steps back one calendar day", () => {
    const today = new Date(2026, 5, 17, 0, 0, 0, 0).getTime();
    expect(shiftDayMs(today, -1)).toBe(new Date(2026, 5, 16).getTime());
  });

  it("crosses a month boundary (Mar 1 -> Feb 28 in a non-leap year)", () => {
    const mar1 = new Date(2026, 2, 1, 0, 0, 0, 0).getTime();
    expect(shiftDayMs(mar1, -1)).toBe(new Date(2026, 1, 28).getTime());
  });
});

describe("historyStartSec", () => {
  it("starts at local midnight the requested number of calendar days back", () => {
    const now = new Date(2026, 5, 17, 14, 30).getTime();
    expect(historyStartSec(now, 30)).toBe(
      Math.floor(new Date(2026, 4, 18).getTime() / 1000),
    );
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
    expect(typeof formatHourTick(ts)).toBe("string");
  });

  it("formats compact durations in whole minutes", () => {
    expect(formatCompactDuration(0)).toBe("0m");
    expect(formatCompactDuration(59)).toBe("<1m");
    expect(formatCompactDuration(60)).toBe("1m");
    expect(formatCompactDuration(90)).toBe("1m");
    expect(formatCompactDuration(3600)).toBe("1h");
    expect(formatCompactDuration(3660)).toBe("1h 1m");
  });
});

describe("minute helpers", () => {
  const now = new Date(2026, 5, 17, 14, 30, 30).getTime();

  it("formats elapsed clocked time with a minutes field", () => {
    expect(formatClockedTime(0)).toBe("0:00");
    expect(formatClockedTime(45)).toBe("0:45");
    expect(formatClockedTime(90)).toBe("1:30");
    expect(formatClockedTime(3661)).toBe("1:01:01");
  });

  it("shows second-precision countdowns", () => {
    expect(
      formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 31)), now),
    ).toBe("0:30");
    expect(
      formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 32, 5)), now),
    ).toBe("1:35");
    expect(
      formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 30)), now),
    ).toBe("0:00");
  });

  it("marks a timer due once it hits zero or is waiting on a response", () => {
    const due = (waitingForResponse: boolean, at: Date) =>
      isTimerDue({ waitingForResponse, nextDueAt: sec(at) }, now);

    expect(due(false, new Date(2026, 5, 17, 14, 30))).toBe(true);
    expect(due(true, new Date(2026, 5, 17, 14, 40))).toBe(true);
    expect(due(false, new Date(2026, 5, 17, 14, 40))).toBe(false);
  });
});

describe("snapToQuarterHour", () => {
  const at = (hours: number, minutes: number, seconds = 0) =>
    sec(new Date(2026, 5, 17, hours, minutes, seconds));

  it("leaves a quarter-hour mark alone", () => {
    expect(snapToQuarterHour(at(10, 0))).toBe(at(10, 0));
    expect(snapToQuarterHour(at(10, 15))).toBe(at(10, 15));
    expect(snapToQuarterHour(at(10, 30))).toBe(at(10, 30));
    expect(snapToQuarterHour(at(10, 45))).toBe(at(10, 45));
  });

  it("rounds to the nearest quarter hour", () => {
    expect(snapToQuarterHour(at(10, 7))).toBe(at(10, 0));
    expect(snapToQuarterHour(at(10, 8))).toBe(at(10, 15));
    expect(snapToQuarterHour(at(10, 22, 29))).toBe(at(10, 15));
    expect(snapToQuarterHour(at(10, 22, 30))).toBe(at(10, 30));
  });

  it("rolls midnight when rounding up past 23:52", () => {
    expect(snapToQuarterHour(at(23, 53))).toBe(sec(new Date(2026, 5, 18)));
  });

  it("snaps by wall-clock fields on an offset-transition day", () => {
    const previousTimeZone = process.env.TZ;
    process.env.TZ = "Africa/Monrovia";
    try {
      const transitionMorning = sec(new Date(1972, 0, 7, 0, 44, 30));
      expect(snapToQuarterHour(transitionMorning)).toBe(
        sec(new Date(1972, 0, 7, 0, 45)),
      );
    } finally {
      if (previousTimeZone === undefined) delete process.env.TZ;
      else process.env.TZ = previousTimeZone;
    }
  });
});

describe("date and time field values", () => {
  const ts = sec(new Date(2026, 5, 17, 14, 5, 9));

  it("splits a timestamp into local date and time fields", () => {
    expect(toDateInput(ts)).toBe("2026-06-17");
    expect(toTimeInput(ts)).toBe("14:05");
  });

  it("recombines date and time, ignoring incomplete values", () => {
    expect(fromDateAndTime("2026-06-17", "14:05")).toBe(
      sec(new Date(2026, 5, 17, 14, 5)),
    );
    expect(fromDateAndTime("2026-06-17", "14:05:09")).toBe(ts);
    expect(fromDateAndTime("", "14:05")).toBeNull();
    expect(fromDateAndTime("2026-06-17", "")).toBeNull();
  });
});

describe("worked time", () => {
  it("starts each visible session at zero without going backwards", () => {
    expect(taskWorkSessionSeconds(100, 130_000)).toBe(30);
    expect(taskWorkSessionSeconds(130, 130_000)).toBe(0);
    expect(taskWorkSessionSeconds(140, 130_000)).toBe(0);
    expect(taskWorkSessionSeconds(null, 130_000)).toBe(0);
  });

  it("formats worked time", () => {
    expect(formatWorkedTime(0)).toBe("0");
    expect(formatWorkedTime(45)).toBe("45");
    expect(formatWorkedTime(60)).toBe("1:00");
    expect(formatWorkedTime(330)).toBe("5:30");
    expect(formatWorkedTime(3_661)).toBe("1:01:01");
  });
});
