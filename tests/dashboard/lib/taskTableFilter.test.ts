import { describe, expect, it } from "vitest";
import type { Task } from "../../../src/lib/types";
import {
  DEFAULT_TASK_TABLE_ROW_FILTERS,
  taskMatchesTableRowFilters,
  type TaskTableRowFilters,
} from "../../../src/dashboard/lib/taskTableFilter";

const at = (day: number, hour: number) =>
  Math.floor(new Date(2026, 0, day, hour).getTime() / 1000);
const nowMs = at(20, 12) * 1000;

const task = (id: number, fields: Partial<Task> = {}): Task => ({
  id, title: `Task ${id}`, description: "", status: "active", workingNow: false,
  workedSeconds: 0, workStartedAt: null, scope: null, value: null, effort: null,
  parentTaskId: null, createdAt: at(1, 9), updatedAt: at(1, 9), closedAt: null,
  followsTaskId: null, ...fields,
});

const matchingIds = (tasks: Task[], filters: Partial<TaskTableRowFilters>, workedTaskIds: ReadonlySet<number> | null = null) =>
  tasks
    .filter((row) => taskMatchesTableRowFilters(row, { ...DEFAULT_TASK_TABLE_ROW_FILTERS, ...filters }, workedTaskIds, nowMs))
    .map((row) => row.id);

describe("table row filters", () => {
  const tasks = [
    task(1),
    task(2, { status: "completed", closedAt: at(8, 11), scope: "Health" }),
    task(3, { status: "cancelled", closedAt: at(9, 0), parentTaskId: 1, value: 4 }),
  ];

  it("matches every Task with no filters", () => {
    expect(matchingIds(tasks, {})).toEqual([1, 2, 3]);
  });

  it("filters Closed by closing day and leaves open Tasks out", () => {
    const day8 = { kind: "range", fromDay: "2026-01-08", toDay: "2026-01-08" } as const;
    expect(matchingIds(tasks, { closed: day8 })).toEqual([2]);
    expect(matchingIds(tasks, { closed: { kind: "range", fromDay: "2026-01-09", toDay: null } })).toEqual([3]);
    expect(matchingIds(tasks, { closed: { kind: "range", fromDay: null, toDay: "2026-01-09" } })).toEqual([2, 3]);
  });

  it("combines status, scope, parent, score, and Worked on", () => {
    expect(matchingIds(tasks, { statuses: ["completed", "cancelled"], scope: "Health" })).toEqual([2]);
    expect(matchingIds(tasks, { parent: "none" })).toEqual([1, 2]);
    expect(matchingIds(tasks, { value: { kind: "scores", scores: [4] } })).toEqual([3]);
    expect(matchingIds(tasks, {}, new Set([1, 3]))).toEqual([1, 3]);
  });
});
