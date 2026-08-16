import { describe, expect, it } from "vitest";
import {
  buildTaskGraph,
  childProgress,
  descendantIds,
  isTaskBlocked,
  unresolvedBlockers,
} from "../../../src/dashboard/lib/taskGraph";
import type { Task, TaskDependency, TaskStatus } from "../../../src/lib/types";

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
  scope: null,
  value: null,
  effort: null,
  parentTaskId,
  createdAt: id,
  updatedAt: id,
});

const dependency = (blockerTaskId: number, blockedTaskId: number): TaskDependency => ({
  blockerTaskId,
  blockedTaskId,
  createdAt: blockerTaskId + blockedTaskId,
});

describe("task graph projection", () => {
  it("indexes hierarchy, blockers, and dependents", () => {
    const graph = buildTaskGraph(
      [task(1), task(2, "backlog", 1), task(3)],
      [dependency(3, 2)],
    );
    expect(graph.childrenByParent.get(1)?.map((value) => value.id)).toEqual([2]);
    expect(graph.blockersByTask.get(2)?.map((value) => value.id)).toEqual([3]);
    expect(graph.dependentsByTask.get(3)?.map((value) => value.id)).toEqual([2]);
  });

  it("derives blocked state only from incomplete blockers", () => {
    const blocked = buildTaskGraph(
      [task(1, "active"), task(2, "active")],
      [dependency(2, 1)],
    );
    expect(isTaskBlocked(blocked, 1)).toBe(true);
    expect(unresolvedBlockers(blocked, 1).map((value) => value.id)).toEqual([2]);

    const ready = buildTaskGraph(
      [task(1, "active"), task(2, "completed")],
      [dependency(2, 1)],
    );
    expect(isTaskBlocked(ready, 1)).toBe(false);
  });

  it("collects transitive descendants and direct child progress", () => {
    const graph = buildTaskGraph(
      [task(1), task(2, "completed", 1), task(3, "active", 2), task(4, "backlog", 1)],
      [],
    );
    expect([...descendantIds(graph, 1)].sort()).toEqual([2, 3, 4]);
    expect(childProgress(graph, 1)).toEqual({ completed: 1, total: 2 });
  });
});
