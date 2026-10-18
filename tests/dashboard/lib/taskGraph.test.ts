import { describe, expect, it } from "vitest";
import {
  ancestorIds,
  buildTaskGraph,
  childProgress,
  descendantIds,
} from "../../../src/dashboard/lib/taskGraph";
import type { Task, TaskStatus } from "../../../src/lib/types";

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
  followsTaskId: null, historyRevision: 0,
  createdAt: id,
  updatedAt: id,
});

describe("task graph projection", () => {
  it("traverses shared children across all parent branches once", () => {
    const graph = buildTaskGraph([
      task(1), task(2, "active", 1), task(3, "active", 1),
      { ...task(4, "completed"), parentTaskIds: [2, 3] },
    ]);
    expect([...ancestorIds(graph, 4)].sort()).toEqual([1, 2, 3]);
    expect([...descendantIds(graph, 1)].sort()).toEqual([2, 3, 4]);
    expect(childProgress(graph, 2)).toEqual({ completed: 1, total: 1 });
    expect(childProgress(graph, 3)).toEqual({ completed: 1, total: 1 });
    expect(childProgress(graph, 1)).toEqual({ completed: 0, total: 2 });
  });

  it("indexes hierarchy", () => {
    const graph = buildTaskGraph(
      [task(1), task(2, "backlog", 1), task(3)],
    );
    expect(graph.childrenByParent.get(1)?.map((value) => value.id)).toEqual([2]);
  });


  it("collects transitive descendants and direct child progress", () => {
    const graph = buildTaskGraph(
      [task(1), task(2, "completed", 1), task(3, "active", 2), task(4, "backlog", 1)],
    );
    expect([...descendantIds(graph, 1)].sort()).toEqual([2, 3, 4]);
    expect(childProgress(graph, 1)).toEqual({ completed: 1, total: 2 });
    expect([...ancestorIds(graph, 3)].sort()).toEqual([1, 2]);
    expect(ancestorIds(graph, 1).size).toBe(0);
  });
});
