import type { Task, TaskStatus, TaskWorkStretch } from "../../lib/types";
import { resolveTaskDateFilter, type TaskDateFilter } from "./taskDateFilter";
import { type TaskGraphProjection, unresolvedBlockers } from "./taskGraph";
import {
  DEFAULT_TASK_TABLE_ROW_FILTERS,
  taskMatchesTableRowFilters,
  type TaskTableRowFilters,
} from "./taskTableFilter";
import { taskWorkedSecondsInRange } from "./taskWorkedOn";
import { toDateInput } from "./time";

export type TaskDaySummary = {
  created: number;
  completed: number;
  cancelled: number;
  incomplete: number;
  workedOn: number;
  workedSeconds: number;
};

export type TaskDayStatusRow = {
  taskId: number;
  at: number;
};

export type TaskDayWorkedRow = {
  taskId: number;
  seconds: number;
};

export type TaskDay = {
  summary: TaskDaySummary;
  created: TaskDayStatusRow[];
  completed: TaskDayStatusRow[];
  cancelled: TaskDayStatusRow[];
  incomplete: TaskDayWorkedRow[];
  worked: TaskDayWorkedRow[];
};

/**
 * Day is the table read one day at a time: each stat lists the rows of one of
 * these table filters. The closing-day lock is what lets current status and
 * Closed stand in for status at the end of a past day.
 */
export function taskDayTableFilters(dayMs: number) {
  const dayInput = toDateInput(dayMs / 1000);
  const day: TaskDateFilter = { kind: "range", fromDay: dayInput, toDay: dayInput };
  const everyTask = DEFAULT_TASK_TABLE_ROW_FILTERS;
  return {
    created: { ...everyTask, created: day },
    completed: { ...everyTask, statuses: ["completed"], closed: day },
    cancelled: { ...everyTask, statuses: ["cancelled"], closed: day },
    workedOn: { ...everyTask, workedOn: day },
    // Incomplete is Worked on without these rows; the table has no filter for
    // "still open when the day ended", so Day takes the complement.
    closedByDayEnd: {
      ...everyTask,
      closed: { kind: "range", fromDay: null, toDay: dayInput },
    },
  } satisfies Record<string, TaskTableRowFilters>;
}

const latestFirst = (rows: TaskDayStatusRow[]) =>
  rows.sort((a, b) => b.at - a.at || b.taskId - a.taskId);

export function buildTaskDay(
  dayMs: number,
  nowMs: number,
  tasks: readonly Task[],
  workStretches: TaskWorkStretch[],
): TaskDay {
  const filters = taskDayTableFilters(dayMs);
  const dayWindow = resolveTaskDateFilter(filters.workedOn.workedOn, nowMs);
  const workedSecondsByTask = dayWindow
    ? taskWorkedSecondsInRange(workStretches, dayWindow, nowMs)
    : new Map<number, number>();
  const workedTaskIds = new Set(workedSecondsByTask.keys());
  const tableRows = (rowFilters: TaskTableRowFilters) =>
    tasks.filter((task) =>
      taskMatchesTableRowFilters(
        task,
        rowFilters,
        rowFilters.workedOn === null ? null : workedTaskIds,
        nowMs,
      ),
    );
  // Completed and Cancelled rows match a Closed filter, so closedAt is set.
  const closedRows = (rowFilters: TaskTableRowFilters) =>
    latestFirst(
      tableRows(rowFilters).map((task) => ({ taskId: task.id, at: task.closedAt! })),
    );

  const created = latestFirst(
    tableRows(filters.created).map((task) => ({ taskId: task.id, at: task.createdAt })),
  );
  const completed = closedRows(filters.completed);
  const cancelled = closedRows(filters.cancelled);
  const worked = tableRows(filters.workedOn)
    .map((task) => ({ taskId: task.id, seconds: workedSecondsByTask.get(task.id) ?? 0 }))
    .sort((a, b) => b.seconds - a.seconds || a.taskId - b.taskId);
  const closedByDayEnd = new Set(
    tableRows(filters.closedByDayEnd).map((task) => task.id),
  );
  const incomplete = worked.filter((row) => !closedByDayEnd.has(row.taskId));
  const workedSeconds = worked.reduce((total, row) => total + row.seconds, 0);

  return {
    created,
    completed,
    cancelled,
    incomplete,
    worked,
    summary: {
      created: created.length,
      completed: completed.length,
      cancelled: cancelled.length,
      incomplete: incomplete.length,
      workedOn: worked.length,
      workedSeconds,
    },
  };
}

export type OpenTaskRow = {
  task: Task;
  unresolvedBlockerCount: number;
  workedTodaySeconds: number;
};

export type OpenTaskGroup = {
  status: TaskStatus;
  rows: OpenTaskRow[];
};

// Active leads because that is where work happens; Backlog trails as the reservoir.
const OPEN_TASK_GROUP_ORDER: TaskStatus[] = ["active", "up_next", "backlog"];

/**
 * Open Tasks grouped by status for today's Day. Within a group, Working now
 * comes first and Blocked Tasks sink below Ready ones, so what can move now
 * leads each column.
 */
export function buildOpenTaskGroups(
  graph: TaskGraphProjection,
  worked: TaskDayWorkedRow[],
): OpenTaskGroup[] {
  const workedTodayByTask = new Map(
    worked.map((row) => [row.taskId, row.seconds]),
  );
  return OPEN_TASK_GROUP_ORDER.map((status) => ({
    status,
    rows: [...graph.byId.values()]
      .filter((task) => task.status === status)
      .map((task) => ({
        task,
        unresolvedBlockerCount: unresolvedBlockers(graph, task.id).length,
        workedTodaySeconds: workedTodayByTask.get(task.id) ?? 0,
      }))
      .sort(
        (a, b) =>
          Number(b.task.workingNow) - Number(a.task.workingNow) ||
          Number(a.unresolvedBlockerCount > 0) -
            Number(b.unresolvedBlockerCount > 0) ||
          b.task.updatedAt - a.task.updatedAt ||
          b.task.id - a.task.id,
      ),
  }));
}
