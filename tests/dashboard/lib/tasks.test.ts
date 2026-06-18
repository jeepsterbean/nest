import { describe, expect, it } from "vitest";
import {
  groupTasksByStatus,
  TASK_STATUSES,
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
  scope: null,
  value: null,
  effort: null,
  createdAt,
  updatedAt,
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

  it("sorts by updatedAt desc, then createdAt desc, then id desc", () => {
    const grouped = groupTasksByStatus([
      task(1, "active", 10, 100),
      task(2, "active", 20, 100), // same updatedAt as #1, higher createdAt -> first
      task(3, "active", 5, 200), // highest updatedAt -> first overall
      task(4, "active", 20, 100), // ties #2 on updatedAt+createdAt, lower id -> after #4? id desc
    ]);
    expect(grouped.active.map((t) => t.id)).toEqual([3, 4, 2, 1]);
  });
});
