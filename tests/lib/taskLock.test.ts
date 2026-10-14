import { describe, expect, it } from "vitest";
import { isTaskLocked } from "../../src/lib/taskLock";

const localSec = (day: number, hour: number, minute = 0) =>
  new Date(2026, 9, day, hour, minute).getTime() / 1000;

describe("isTaskLocked", () => {
  const nowMs = localSec(12, 9) * 1000;

  it("leaves open Tasks unlocked", () => {
    expect(isTaskLocked({ status: "active", closedAt: null }, nowMs)).toBe(
      false,
    );
  });

  it("keeps a Task closed today reopenable until midnight", () => {
    expect(
      isTaskLocked({ status: "completed", closedAt: localSec(12, 0) }, nowMs),
    ).toBe(false);
    expect(
      isTaskLocked(
        { status: "cancelled", closedAt: localSec(12, 8, 59) },
        nowMs,
      ),
    ).toBe(false);
  });

  it("locks a Task closed on an earlier day, however recently", () => {
    const justBeforeMidnight = localSec(11, 23, 59);
    expect(
      isTaskLocked(
        { status: "completed", closedAt: justBeforeMidnight },
        localSec(12, 0, 1) * 1000,
      ),
    ).toBe(true);
    expect(
      isTaskLocked({ status: "cancelled", closedAt: localSec(3, 14) }, nowMs),
    ).toBe(true);
  });

  it("locks a closed Task whose closure was never recorded", () => {
    expect(isTaskLocked({ status: "completed", closedAt: null }, nowMs)).toBe(
      true,
    );
  });
});
