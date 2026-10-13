import type { RatingValue } from "./rating";

export type TaskStatus =
  | "backlog"
  | "up_next"
  | "active"
  | "completed"
  | "cancelled";

/** Status values that may appear in history, including retired ones. */
export type RecordedTaskStatus = TaskStatus | "paused";

export type Task = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  workingNow: boolean;
  workedSeconds: number;
  workStartedAt: number | null;
  scope: string | null;
  value: RatingValue | null;
  effort: RatingValue | null;
  parentTaskId: number | null;
  createdAt: number;
  updatedAt: number;
  /** When the Task entered the closed status it holds now; null while open. */
  closedAt: number | null;
  /** The closed Task this one was created as a follow-up to. */
  followsTaskId: number | null;
};

/** One recorded stretch of Working now. Open (still running) while endedAt is null. */
export type TaskWorkStretch = {
  id: number;
  taskId: number;
  startedAt: number;
  endedAt: number | null;
};

export type TaskDependency = {
  blockerTaskId: number;
  blockedTaskId: number;
  createdAt: number;
};

export type TaskStatusEvent = {
  id: number;
  taskId: number;
  fromStatus: RecordedTaskStatus | null;
  toStatus: RecordedTaskStatus;
  createdAt: number;
};
