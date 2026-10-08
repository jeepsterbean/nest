import { describe, expect, it } from "vitest";
import type { Task } from "../../../src/lib/types";
import { sortTasksByColumn } from "../../../src/dashboard/lib/taskColumnSort";

const task = (id: number, fields: Partial<Task>): Task => ({
  id, title: `Task ${id}`, description: "", status: "active", workingNow: false,
  workedSeconds: 0, workStartedAt: null, scope: null, value: null, effort: null,
  parentTaskId: null, createdAt: id, updatedAt: id, ...fields,
});

describe("column sorting", () => {
  it("keeps missing scores last in both directions and preserves the source", () => {
    const tasks = [task(1, { value: null }), task(2, { value: 5 }), task(3, { value: 2 })];
    expect(sortTasksByColumn(tasks, { column: "value", direction: "ascending" }).map(t => t.id)).toEqual([3, 2, 1]);
    expect(sortTasksByColumn(tasks, { column: "value", direction: "descending" }).map(t => t.id)).toEqual([2, 3, 1]);
    expect(tasks.map(t => t.id)).toEqual([1, 2, 3]);
  });
  it("removing the sort preserves the incoming task order", () => {
    const tasks = [task(3, {}), task(1, {}), task(2, {})];
    expect(sortTasksByColumn(tasks, null).map(t => t.id)).toEqual([3, 1, 2]);
  });
  it("sorts Status in lifecycle order and text columns case-insensitively", () => {
    const tasks = [task(1, { status: "completed", title: "beta" }), task(2, { status: "backlog", title: "Alpha" }), task(3, { status: "active", title: "gamma" })];
    expect(sortTasksByColumn(tasks, { column: "status", direction: "ascending" }).map(t => t.id)).toEqual([2, 3, 1]);
    expect(sortTasksByColumn(tasks, { column: "title", direction: "ascending" }).map(t => t.id)).toEqual([2, 1, 3]);
  });
  it("sorts Parent by the parent's title, even when the parent row is filtered out", () => {
    const parents = [task(10, { title: "Zebra" }), task(11, { title: "Apple" })];
    const tasks = [task(1, { parentTaskId: 10 }), task(2, { parentTaskId: null }), task(3, { parentTaskId: 11 })];
    const byId = new Map([...parents, ...tasks].map(t => [t.id, t]));
    expect(sortTasksByColumn(tasks, { column: "parent", direction: "ascending" }, byId).map(t => t.id)).toEqual([3, 1, 2]);
    expect(sortTasksByColumn(tasks, { column: "parent", direction: "descending" }, byId).map(t => t.id)).toEqual([1, 3, 2]);
  });
});
