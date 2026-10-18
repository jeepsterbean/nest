import { describe, expect, it } from "vitest";
import type { Task, TaskStatus } from "../../../src/lib/types";
import { taskRelationshipCandidates } from "../../../src/dashboard/lib/taskRelationshipCandidates";

const task = (
  id: number,
  status: TaskStatus = "backlog",
  parentTaskId: number | null = null,
): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status,
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  value: null,
  effort: null,
  parentTaskIds: parentTaskId === null ? [] : [parentTaskId],
  closedAt: null,
  followsTaskId: null,
  historyRevision: 0,
  createdAt: id,
  updatedAt: id,
});

const nowSeconds = 2_000_000;
const cutoff = nowSeconds - 7 * 24 * 60 * 60;
const candidates = (tasks: Task[]) =>
  taskRelationshipCandidates(tasks, nowSeconds * 1000);

describe("relationship suggestions", () => {
  it("includes open and recently closed Tasks and puts older closures after them", () => {
    const old = { ...task(1, "completed"), updatedAt: nowSeconds, closedAt: cutoff - 1 };
    const recent = { ...task(2, "cancelled"), closedAt: cutoff };
    const result = candidates([old, recent, task(3, "active")]);
    expect(result.map(({ task, searchOnly }) => [task.id, searchOnly])).toEqual([
      [3, false], [2, false], [1, true],
    ]);
  });

  it("keeps closed Tasks without a closure timestamp available through search", () => {
    expect(candidates([task(1, "completed")])[0].searchOnly).toBe(true);
  });

  it("sorts by latest update with stable ties and preserves input order", () => {
    const tasks = [task(1), { ...task(2), updatedAt: 4 }, { ...task(3), updatedAt: 4 }];
    expect(candidates(tasks).map(({ task }) => task.id)).toEqual([3, 2, 1]);
    expect(tasks.map(task => task.id)).toEqual([1, 2, 3]);
  });
});
