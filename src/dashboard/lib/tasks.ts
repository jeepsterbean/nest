import type { RatingValue, Task, TaskStatus } from "../../lib/types";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
  "completed",
  "cancelled",
];

// Live work statuses, in flow order. Completed and cancelled are terminal.
export const WORKING_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
];

export const CLOSED_STATUSES: TaskStatus[] = ["completed", "cancelled"];

/** Popup history above Active: closed Tasks still in this window. */
export const RECENT_CLOSED_WINDOW_SECONDS = 60 * 60;

/**
 * Completed and cancelled Tasks whose last update falls in the last hour,
 * oldest first so the newest sits just above Active.
 * ponytail: uses updatedAt, not status events; a later rename can keep an
 * older close in the window. Switch to events if that starts to matter.
 */
export const recentlyClosedTasks = (taskList: Task[], nowMs: number): Task[] => {
  const cutoff = nowMs / 1000 - RECENT_CLOSED_WINDOW_SECONDS;
  return taskList
    .filter(
      (task) =>
        CLOSED_STATUSES.includes(task.status) && task.updatedAt >= cutoff,
    )
    .sort((a, b) => a.updatedAt - b.updatedAt || a.id - b.id);
};

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  up_next: "Up next",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const TASK_STATUS_FILTERS = TASK_STATUSES.map((status) => ({
  key: status,
  label: TASK_STATUS_LABEL[status],
}));

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

// Working now outranks manual order, always: a working task sits above every
// idle one and no drag can push it below. Sort is stable, so the manual
// sort_order still decides the order inside each band.
export const pinWorkingNowFirst = <T extends { workingNow: boolean }>(
  taskList: T[],
): T[] =>
  [...taskList].sort((a, b) => Number(b.workingNow) - Number(a.workingNow));

/**
 * Ids in drop order, re-pinned so working-now tasks keep the top and lane
 * placeholders (negative ids) drop out. Persist this, never the raw drop.
 */
export const pinnedIdOrder = (ids: number[], taskList: Task[]): number[] => {
  const byId = new Map(taskList.map((task) => [task.id, task]));
  return pinWorkingNowFirst(
    ids.flatMap((id) => {
      const task = byId.get(id);
      return task ? [task] : [];
    }),
  ).map((task) => task.id);
};

// Lanes otherwise keep the input order: tasks arrive in their manual
// sort_order, which drag-to-reorder owns.
export const groupTasksByStatus = (taskList: Task[]) => {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    up_next: [],
    active: [],
    completed: [],
    cancelled: [],
  };
  for (const task of taskList) grouped[task.status].push(task);
  for (const status of TASK_STATUSES) {
    grouped[status] = pinWorkingNowFirst(grouped[status]);
  }
  return grouped;
};
