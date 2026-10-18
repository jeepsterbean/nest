import { describe, expect, it } from "vitest";
import {
  CLOSED_STATUSES,
  groupTasksByStatus,
  matchingTaskStatusPreset,
  parseRatingValue,
  pinnedIdOrder,
  recentlyClosedTasks,
  RECENT_CLOSED_WINDOW_SECONDS,
  sortTaskTable,
  taskStatusFilterLabel,
  toggleTaskStatusFilter,
  TASK_STATUSES,
  WORKING_STATUSES,
} from "../../../src/dashboard/lib/tasks";
import type { Task, TaskStatus } from "../../../src/lib/types";

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

  value: null,
  effort: null,
  parentTaskIds: [],
  closedAt: null,
  followsTaskId: null, historyRevision: 0,
  createdAt,
  updatedAt,
});

describe("board status groups", () => {
  it("splits every status into exactly one of working or closed", () => {
    const combined = [...WORKING_STATUSES, ...CLOSED_STATUSES];
    expect([...combined].sort()).toEqual([...TASK_STATUSES].sort());
    expect(new Set(combined).size).toBe(combined.length);
  });
});

describe("table status filters", () => {
  it("recognizes presets and keeps custom selections in status order", () => {
    expect(matchingTaskStatusPreset(["active", "backlog", "up_next"])).toBe(
      "open",
    );
    expect(matchingTaskStatusPreset(["active", "completed"])).toBeNull();
    expect(toggleTaskStatusFilter(["active"], "backlog")).toEqual([
      "backlog",
      "active",
    ]);
    expect(toggleTaskStatusFilter(["backlog", "active"], "active")).toEqual([
      "backlog",
    ]);
  });
});

describe("taskStatusFilterLabel", () => {
  it("names presets, the one status left out, or the set in lifecycle order", () => {
    expect(taskStatusFilterLabel(["active", "backlog", "up_next"])).toBe("Open");
    expect(taskStatusFilterLabel([])).toBe("None");
    expect(taskStatusFilterLabel(["completed", "backlog", "up_next", "active"])).toBe("≠ Cancelled");
    expect(taskStatusFilterLabel(["completed", "active"])).toBe("Active, Completed");
  });
});

describe("sortTaskTable", () => {
  const tasks = [
    task(1, "cancelled", 1, 80),
    task(2, "backlog", 2, 70),
    task(3, "active", 3, 60),
    task(4, "completed", 4, 50),
    task(5, "up_next", 5, 40),
    task(6, "active", 6, 90),
  ];

  it("sorts by recency or workflow status with recency inside each status", () => {
    expect(sortTaskTable(tasks, "updated").map(({ id }) => id)).toEqual([
      6, 1, 2, 3, 4, 5,
    ]);
    expect(sortTaskTable(tasks, "status").map(({ id }) => id)).toEqual([
      6, 3, 5, 2, 4, 1,
    ]);
  });
});

describe("parseRatingValue", () => {
  it("accepts ratings from 1 to 5 and an empty value", () => {
    expect(parseRatingValue("1")).toBe(1);
    expect(parseRatingValue("5")).toBe(5);
    expect(parseRatingValue("")).toBeNull();
    expect(parseRatingValue("0")).toBeUndefined();
    expect(parseRatingValue("6")).toBeUndefined();
    expect(parseRatingValue("2.5")).toBeUndefined();
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

  it("pins working-now tasks above every task that is not working", () => {
    const grouped = groupTasksByStatus([
      task(3, "active"),
      { ...task(1, "active"), workingNow: true },
      task(2, "active"),
      { ...task(4, "active"), workingNow: true },
    ]);
    expect(grouped.active.map((t) => t.id)).toEqual([1, 4, 3, 2]);
  });
});

describe("recentlyClosedTasks", () => {
  const nowMs = 1_000_000_000_000;
  const nowSecs = nowMs / 1000;
  const closed = (
    id: number,
    status: "completed" | "cancelled",
    updatedAt: number,
  ) => task(id, status, id, updatedAt);

  it("keeps completed and cancelled Tasks updated within the last hour", () => {
    const recent = recentlyClosedTasks(
      [
        closed(1, "completed", nowSecs - 10),
        closed(2, "cancelled", nowSecs - 30),
        task(3, "active", 3, nowSecs),
        task(4, "up_next", 4, nowSecs),
        closed(5, "completed", nowSecs - RECENT_CLOSED_WINDOW_SECONDS - 1),
      ],
      nowMs,
    );
    expect(recent.map((t) => t.id)).toEqual([2, 1]);
  });

  it("includes a close exactly at the window edge", () => {
    const recent = recentlyClosedTasks(
      [closed(1, "completed", nowSecs - RECENT_CLOSED_WINDOW_SECONDS)],
      nowMs,
    );
    expect(recent.map((t) => t.id)).toEqual([1]);
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

  it("keeps the dropped order among tasks that are not working", () => {
    expect(pinnedIdOrder([3, 2, 1], tasks)).toEqual([1, 3, 2]);
  });

  it("drops status group placeholders and unknown ids", () => {
    expect(pinnedIdOrder([-1, 2, -2, 99], tasks)).toEqual([2]);
  });
});
