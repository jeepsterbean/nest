import type { RatingValue, Task, TaskStatus } from "../../lib/types";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
  "completed",
  "paused",
  "cancelled",
];

// Board lanes: statuses that hold live work, in flow order. Completed and
// cancelled are terminal and live in the board's closed rail instead.
export const WORKING_STATUSES: TaskStatus[] = [
  "backlog",
  "up_next",
  "active",
  "paused",
];

export const CLOSED_STATUSES: TaskStatus[] = ["completed", "cancelled"];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  up_next: "Up next",
  active: "Active",
  paused: "Paused",
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

export const groupTasksByStatus = (taskList: Task[]) => {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    up_next: [],
    active: [],
    paused: [],
    completed: [],
    cancelled: [],
  };
  for (const task of taskList) grouped[task.status].push(task);
  for (const status of TASK_STATUSES) {
    grouped[status].sort(
      (a, b) =>
        Number(b.workingNow) - Number(a.workingNow) ||
        b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id - a.id,
    );
  }
  return grouped;
};
