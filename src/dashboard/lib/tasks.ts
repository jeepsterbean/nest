import type { RatingValue, Task, TaskStatus } from "../../lib/types";

export const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "active",
  "completed",
  "paused",
  "cancelled",
];

export const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

export const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

export const groupTasksByStatus = (taskList: Task[]) => {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    active: [],
    paused: [],
    completed: [],
    cancelled: [],
  };
  for (const task of taskList) grouped[task.status].push(task);
  for (const status of TASK_STATUSES) {
    grouped[status].sort(
      (a, b) =>
        b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id - a.id,
    );
  }
  return grouped;
};
