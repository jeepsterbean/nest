import type { Task } from "../../lib/types";
import { scopeMatches } from "./scope";
import { taskMatchesDateFilter } from "./taskDateFilter";
import { taskMatchesScoreFilter } from "./taskScoreFilter";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableQuery } from "./taskTableViews";

/**
 * The row filters that hold for a whole clock day. The Worked time duration
 * filter is applied separately because it follows the live clock.
 */
export type TaskTableRowFilters = Omit<TaskTableQuery, "sort" | "columns" | "workedTime">;

export const DEFAULT_TASK_TABLE_ROW_FILTERS: TaskTableRowFilters = DEFAULT_TASK_TABLE_QUERY;

/** Shared by the table and Day, so a Day stat lists the rows its table query would. */
export const taskMatchesTableRowFilters = (
  task: Task,
  filters: TaskTableRowFilters,
  /** Tasks with Worked time in the Worked on range; null while Worked on is unset. */
  workedTaskIds: ReadonlySet<number> | null,
  nowMs: number = Date.now(),
): boolean =>
  scopeMatches(task.scope, filters.scope) &&
  (workedTaskIds === null || workedTaskIds.has(task.id)) &&
  filters.statuses.includes(task.status) &&
  (filters.parent === null ||
    (filters.parent === "none" ? task.parentTaskId === null : task.parentTaskId === filters.parent)) &&
  taskMatchesDateFilter(task.createdAt, filters.created, nowMs) &&
  taskMatchesDateFilter(task.updatedAt, filters.updated, nowMs) &&
  // An open Task has no closing day, so any Closed filter leaves it out.
  (filters.closed === null ||
    (task.closedAt !== null && taskMatchesDateFilter(task.closedAt, filters.closed, nowMs))) &&
  taskMatchesScoreFilter(task.value, filters.value) &&
  taskMatchesScoreFilter(task.effort, filters.effort);
