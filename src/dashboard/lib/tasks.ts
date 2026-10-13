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

export type TaskTableSort = "updated" | "status";

const TASK_STATUS_SORT_ORDER: Record<TaskStatus, number> = {
  active: 0,
  up_next: 1,
  backlog: 2,
  completed: 3,
  cancelled: 4,
};

export const sortTaskTable = (
  taskList: Task[],
  sort: TaskTableSort,
): Task[] =>
  [...taskList].sort(
    (a, b) =>
      (sort === "status"
        ? TASK_STATUS_SORT_ORDER[a.status] - TASK_STATUS_SORT_ORDER[b.status]
        : 0) ||
      b.updatedAt - a.updatedAt ||
      b.id - a.id,
  );

export const TASK_STATUS_PRESETS = [
  { key: "open", label: "Open", statuses: WORKING_STATUSES },
  { key: "closed", label: "Closed", statuses: CLOSED_STATUSES },
  { key: "all", label: "All", statuses: TASK_STATUSES },
] as const;

export const matchingTaskStatusPreset = (selected: TaskStatus[]) =>
  TASK_STATUS_PRESETS.find(
    ({ statuses }) =>
      statuses.length === selected.length &&
      statuses.every((status) => selected.includes(status)),
  )?.key ?? null;

/** Pill text for the table's status set: a preset name, the one status left out
 *  (`≠ Cancelled`), or the statuses in lifecycle order. */
export const taskStatusFilterLabel = (selected: TaskStatus[]): string => {
  const preset = TASK_STATUS_PRESETS.find(({ key }) => key === matchingTaskStatusPreset(selected));
  if (preset) return preset.label;
  if (selected.length === 0) return "None";
  if (selected.length === TASK_STATUSES.length - 1) {
    return `≠ ${TASK_STATUS_LABEL[TASK_STATUSES.find((status) => !selected.includes(status))!]}`;
  }
  return TASK_STATUSES.filter((status) => selected.includes(status))
    .map((status) => TASK_STATUS_LABEL[status])
    .join(", ");
};

export const toggleTaskStatusFilter = (
  selected: TaskStatus[],
  status: TaskStatus,
): TaskStatus[] =>
  selected.includes(status)
    ? selected.filter((candidate) => candidate !== status)
    : TASK_STATUSES.filter(
        (candidate) => candidate === status || selected.includes(candidate),
      );

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

export const parseRatingValue = (
  value: string,
): RatingValue | null | undefined => {
  if (value === "") return null;
  const number = Number(value);
  return Number.isInteger(number) && number >= 1 && number <= 5
    ? (number as RatingValue)
    : undefined;
};

// Working now outranks manual order, always: a working task sits above every
// task that is not working and no drag can push it below. Sort is stable, so the manual
// sort_order still decides the order inside each band.
export const pinWorkingNowFirst = <T extends { workingNow: boolean }>(
  taskList: T[],
): T[] =>
  [...taskList].sort((a, b) => Number(b.workingNow) - Number(a.workingNow));

/**
 * Ids in drop order, re-pinned so working-now tasks keep the top and status
 * group placeholders (negative ids) drop out. Persist this, never the raw drop.
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

// Status groups otherwise keep the input order: tasks arrive in their manual
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
