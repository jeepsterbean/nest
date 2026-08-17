import { describe, expect, it } from "vitest";
import {
  CLOSED_STATUSES,
  clusterByScore,
  groupTasksByStatus,
  pinnedIdOrder,
  TASK_STATUSES,
  WORKING_STATUSES,
} from "../../../src/dashboard/lib/tasks";
import type { RatingValue, Task, TaskStatus } from "../../../src/lib/types";

const task = (
  id: number,
  status: TaskStatus,
  createdAt = id,
  updatedAt = id,
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
  parentTaskId: null,
  createdAt,
  updatedAt,
});

const scoredTask = (
  id: number,
  value: RatingValue | null,
  effort: RatingValue | null,
): Task => ({
  ...task(id, "backlog"),
  value,
  effort,
});

describe("board status groups", () => {
  it("splits every status into exactly one of working or closed", () => {
    const combined = [...WORKING_STATUSES, ...CLOSED_STATUSES];
    expect([...combined].sort()).toEqual([...TASK_STATUSES].sort());
    expect(new Set(combined).size).toBe(combined.length);
  });
});

describe("clusterByScore", () => {
  it("groups tasks sharing the same value and effort", () => {
    const clusters = clusterByScore([
      scoredTask(1, 4, 2),
      scoredTask(2, 4, 2),
      scoredTask(3, 1, 5),
    ]);
    expect(clusters.get("4:2")?.map((t) => t.id)).toEqual([1, 2]);
    expect(clusters.get("1:5")?.map((t) => t.id)).toEqual([3]);
    expect(clusters.size).toBe(2);
  });

  it("excludes tasks missing either score", () => {
    const clusters = clusterByScore([
      scoredTask(1, 3, null),
      scoredTask(2, null, 3),
      scoredTask(3, null, null),
    ]);
    expect(clusters.size).toBe(0);
  });

  it("preserves input order within a cluster and across clusters", () => {
    const clusters = clusterByScore([
      scoredTask(9, 2, 2),
      scoredTask(1, 5, 1),
      scoredTask(4, 2, 2),
    ]);
    expect([...clusters.keys()]).toEqual(["2:2", "5:1"]);
    expect(clusters.get("2:2")?.map((t) => t.id)).toEqual([9, 4]);
  });
});

describe("groupTasksByStatus", () => {
  it("returns a bucket for every status, even when empty", () => {
    const grouped = groupTasksByStatus([]);
    for (const status of TASK_STATUSES) {
      expect(grouped[status]).toEqual([]);
    }
  });

  it("places each task in its own status bucket", () => {
    const grouped = groupTasksByStatus([
      task(1, "active"),
      task(2, "backlog"),
      task(3, "up_next"),
    ]);
    expect(grouped.active.map((t) => t.id)).toEqual([1]);
    expect(grouped.backlog.map((t) => t.id)).toEqual([2]);
    expect(grouped.up_next.map((t) => t.id)).toEqual([3]);
  });

  it("keeps the manual list order inside each bucket", () => {
    const grouped = groupTasksByStatus([
      task(3, "active", 5, 200),
      task(1, "active", 10, 100),
      task(4, "backlog", 20, 100),
      task(2, "active", 20, 100),
    ]);
    expect(grouped.active.map((t) => t.id)).toEqual([3, 1, 2]);
    expect(grouped.backlog.map((t) => t.id)).toEqual([4]);
  });

  it("pins working-now tasks above every idle one", () => {
    const grouped = groupTasksByStatus([
      task(3, "active"),
      { ...task(1, "active"), workingNow: true },
      task(2, "active"),
      { ...task(4, "active"), workingNow: true },
    ]);
    expect(grouped.active.map((t) => t.id)).toEqual([1, 4, 3, 2]);
  });
});

describe("pinnedIdOrder", () => {
  const tasks = [
    { ...task(1, "active"), workingNow: true },
    task(2, "active"),
    task(3, "up_next"),
  ];

  it("hoists a working task back to the top of a drop that buried it", () => {
    expect(pinnedIdOrder([2, 3, 1], tasks)).toEqual([1, 2, 3]);
  });

  it("keeps the dropped order among idle tasks", () => {
    expect(pinnedIdOrder([3, 2, 1], tasks)).toEqual([1, 3, 2]);
  });

  it("drops lane placeholders and unknown ids", () => {
    expect(pinnedIdOrder([-1, 2, -2, 99], tasks)).toEqual([2]);
  });
});
