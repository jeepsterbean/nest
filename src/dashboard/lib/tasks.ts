import type { RatingValue, Task, TaskStatus } from "../../lib/types";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
  "completed",
  "cancelled",
];

// Board lanes: statuses that hold live work, in flow order. Completed and
// cancelled are terminal and live in the board's closed rail instead.
export const WORKING_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
];

export const CLOSED_STATUSES: TaskStatus[] = ["completed", "cancelled"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  up_next: "Up next",
  active: "Active",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

// Groups scored tasks that share the same value/effort cell so the priority
// matrix can fan them out instead of stacking chips invisibly. Input order is
// preserved, so pass a deterministically sorted list.
export const clusterByScore = (taskList: Task[]): Map<string, Task[]> => {
  const clusters = new Map<string, Task[]>();
  for (const task of taskList) {
    if (task.value === null || task.effort === null) continue;
    const key = `${task.value}:${task.effort}`;
    const cluster = clusters.get(key);
    if (cluster) cluster.push(task);
    else clusters.set(key, [task]);
  }
  return clusters;
};

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
