import type { Task } from "../../lib/types";
import type { TaskTableColumnId } from "./taskTable";
import { taskDisplayedWorkedSeconds } from "./time";
import { TASK_STATUSES } from "./tasks";

export type TaskColumnSort = {
  column: TaskTableColumnId;
  direction: "ascending" | "descending";
};

const DIRECTION_LABELS: Record<TaskTableColumnId, { ascending: string; descending: string }> = {
  title: { ascending: "A to Z", descending: "Z to A" },
  scope: { ascending: "A to Z", descending: "Z to A" },
  parent: { ascending: "A to Z", descending: "Z to A" },
  status: { ascending: "Backlog first", descending: "Cancelled first" },
  value: { ascending: "Lowest first", descending: "Highest first" },
  effort: { ascending: "Lowest first", descending: "Highest first" },
  workedTime: { ascending: "Lowest first", descending: "Highest first" },
  created: { ascending: "Oldest first", descending: "Newest first" },
  updated: { ascending: "Oldest first", descending: "Newest first" },
};

export const taskSortDirectionLabel = (sort: TaskColumnSort) =>
  DIRECTION_LABELS[sort.column][sort.direction];

/** Parent titles come from the full task list because a filter may hide the parent row. */
export function sortTasksByColumn(tasks: Task[], sort: TaskColumnSort | TaskColumnSort[] | null, taskById?: ReadonlyMap<number, Task>, nowMs: number = Date.now()) {
  const rules = sort === null ? [] : Array.isArray(sort) ? sort : [sort];
  if (rules.length === 0) return tasks;
  const value = (task: Task, sort: TaskColumnSort): string | number | null => {
    switch (sort.column) {
      case "title": return task.title;
      case "scope": return task.scope;
      case "parent": return task.parentTaskId === null ? null : taskById?.get(task.parentTaskId)?.title ?? null;
      case "status": return TASK_STATUSES.indexOf(task.status);
      case "value": return task.value;
      case "effort": return task.effort;
      case "workedTime": return taskDisplayedWorkedSeconds(task, nowMs);
      case "created": return task.createdAt;
      case "updated": return task.updatedAt;
    }
  };
  return [...tasks].sort((a, b) => {
    for (const rule of rules) {
      const left = value(a, rule);
      const right = value(b, rule);
      // Empty values stay last in either direction.
      if (left === null && right !== null) return 1;
      if (right === null && left !== null) return -1;
      const comparison = typeof left === "string" && typeof right === "string"
        ? left.localeCompare(right, undefined, { sensitivity: "base" })
        : Number(left) - Number(right);
      if (comparison) return comparison * (rule.direction === "ascending" ? 1 : -1);
    }
    return b.updatedAt - a.updatedAt || b.id - a.id;
  });
}
