import { describe, expect, it } from "vitest";
import {
  adjacentTimerInterval,
  formatTimerCountdown,
  isTimerDue,
} from "../../src/lib/timer";

const sec = (date: Date) => Math.floor(date.getTime() / 1000);

describe("formatTimerCountdown", () => {
  const now = new Date(2026, 5, 17, 14, 30, 30).getTime();

  it("shows second-precision countdowns", () => {
    expect(formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 31)), now)).toBe(
      "0:30",
    );
    expect(
      formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 32, 5)), now),
    ).toBe("1:35");
    expect(formatTimerCountdown(sec(new Date(2026, 5, 17, 14, 30)), now)).toBe(
      "0:00",
    );
  });
});

describe("isTimerDue", () => {
  const now = new Date(2026, 5, 17, 14, 30, 30).getTime();

  it("marks a Timer due once it hits zero or is waiting on a response", () => {
    const due = (waitingForResponse: boolean, at: Date) =>
      isTimerDue({ waitingForResponse, nextDueAt: sec(at) }, now);

    expect(due(false, new Date(2026, 5, 17, 14, 30))).toBe(true);
    expect(due(true, new Date(2026, 5, 17, 14, 40))).toBe(true);
    expect(due(false, new Date(2026, 5, 17, 14, 40))).toBe(false);
  });
});

describe("adjacentTimerInterval", () => {
  it("moves between Timer values and stops at either end", () => {
    expect(adjacentTimerInterval(15, 1)).toBe(20);
    expect(adjacentTimerInterval(15, -1)).toBe(10);
    expect(adjacentTimerInterval(30, 1)).toBe(30);
    expect(adjacentTimerInterval(5, -1)).toBe(5);
  });
});
