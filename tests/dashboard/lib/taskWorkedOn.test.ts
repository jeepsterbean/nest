import { describe, expect, it } from "vitest";
import type { Task, TaskWorkStretch } from "../../../src/lib/types";
import { taskWorkedSecondsInRange } from "../../../src/dashboard/lib/taskWorkedOn";
import { resolveTaskDateFilter } from "../../../src/dashboard/lib/taskDateFilter";
import { sortTasksByColumn } from "../../../src/dashboard/lib/taskColumnSort";
import { taskMatchesWorkedTimeFilter } from "../../../src/dashboard/lib/taskWorkedTimeFilter";

const stretch = (taskId: number, startedAt: number, endedAt: number | null): TaskWorkStretch =>
  ({ id: taskId, taskId, startedAt, endedAt });
const task = (id: number, workedSeconds: number): Task => ({
  id, title: `Task ${id}`, description: "", status: "active", workingNow: false,
  workedSeconds, workStartedAt: null, value: null, effort: null,
  parentTaskId: null, createdAt: 0, updatedAt: 0, closedAt: null, followsTaskId: null, historyRevision: 0,
});

describe("Worked on range", () => {
  it("sums clipped stretches and excludes boundary-only and zero-length work", () => {
    const totals = taskWorkedSecondsInRange([
      stretch(1, 50, 150), stretch(1, 180, 250),
      stretch(2, 0, 100), stretch(3, 200, 300), stretch(4, 120, 120),
      stretch(5, 130, 131),
    ], { fromSec: 100, toSec: 200 }, 400_000);
    expect([...totals]).toEqual([[1, 70], [5, 1]]);
  });

  it("splits overnight work across inclusive local calendar days", () => {
    const start = new Date(2026, 9, 5, 23, 50).getTime() / 1000;
    const end = new Date(2026, 9, 6, 0, 10).getTime() / 1000;
    const nowMs = new Date(2026, 9, 7).getTime();
    const stretches = [stretch(1, start, end)];
    for (const day of ["2026-10-05", "2026-10-06"]) {
      const range = resolveTaskDateFilter({ kind: "range", fromDay: day, toDay: day }, nowMs)!;
      expect(taskWorkedSecondsInRange(stretches, range, nowMs).get(1)).toBe(600);
    }
  });

  it("grows live work through now and freezes it at a past range's end", () => {
    const stretches = [stretch(1, 50, null)];
    expect(taskWorkedSecondsInRange(stretches, { fromSec: 100, toSec: 200 }, 150_000).get(1)).toBe(50);
    expect(taskWorkedSecondsInRange(stretches, { fromSec: 100, toSec: 200 }, 180_000).get(1)).toBe(80);
    expect(taskWorkedSecondsInRange(stretches, { fromSec: 100, toSec: 200 }, 300_000).get(1)).toBe(100);
    expect(taskWorkedSecondsInRange(stretches, { fromSec: 400, toSec: 500 }, 300_000).size).toBe(0);
  });

  it("supports either bound being empty", () => {
    const stretches = [stretch(1, 50, 150), stretch(2, 180, null)];
    expect([...taskWorkedSecondsInRange(stretches, { fromSec: null, toSec: 100 }, 300_000)])
      .toEqual([[1, 50]]);
    expect([...taskWorkedSecondsInRange(stretches, { fromSec: 100, toSec: null }, 300_000)])
      .toEqual([[1, 50], [2, 120]]);
  });

  it("uses range time for duration filtering and sorting, then restores all-time behavior", () => {
    const tasks = [task(1, 36_000), task(2, 7_200)];
    const totals = new Map([[1, 1_200], [2, 3_600]]);
    const filter = { comparator: "more", seconds: 3_600 } as const;
    expect(tasks.filter(t => taskMatchesWorkedTimeFilter(t, filter, 0, totals.get(t.id))).map(t => t.id)).toEqual([2]);
    expect(tasks.filter(t => taskMatchesWorkedTimeFilter(t, filter, 0)).map(t => t.id)).toEqual([1, 2]);
    const sort = { column: "workedTime", direction: "descending" } as const;
    expect(sortTasksByColumn(tasks, sort, undefined, 0, totals).map(t => t.id)).toEqual([2, 1]);
    expect(sortTasksByColumn(tasks, sort, undefined, 0).map(t => t.id)).toEqual([1, 2]);
  });
});
