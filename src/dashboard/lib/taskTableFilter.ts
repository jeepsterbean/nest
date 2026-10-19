import type { Task } from "../../lib/types";
import { taskMatchesDateFilter } from "./taskDateFilter";
import { taskMatchesScoreFilter } from "./taskScoreFilter";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableQuery } from "./taskTableViews";

/**
 * The row filters that hold for a whole clock day. The Worked time duration
 * filter is applied separately because it follows the live clock.
 */
export type TaskTableRowFilters = Omit<TaskTableQuery, "sort" | "nested" | "columns" | "workedTime">;

export const DEFAULT_TASK_TABLE_ROW_FILTERS: TaskTableRowFilters = DEFAULT_TASK_TABLE_QUERY;

/** Tasks matched from fetched history; each set is null while its filter is unset. */
export type TaskTableHistoryMatches = {
  /** Tasks with Worked time in the Worked on range. */
  workedOn: ReadonlySet<number> | null;
  /** Tasks with a status transition in the Status changed range. */
  statusChanged: ReadonlySet<number> | null;
};

export const NO_TASK_TABLE_HISTORY_MATCHES: TaskTableHistoryMatches = { workedOn: null, statusChanged: null };

export const taskMatchesTableRowFilters = (
  task: Task,
  filters: TaskTableRowFilters,
  historyMatches: TaskTableHistoryMatches,
  nowMs: number = Date.now(),
): boolean =>
  (historyMatches.workedOn === null || historyMatches.workedOn.has(task.id)) &&
  (historyMatches.statusChanged === null || historyMatches.statusChanged.has(task.id)) &&
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
