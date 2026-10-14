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
  /** Changes whenever an entry joins or leaves the Task's History. */
  historyRevision: number;
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

export type TaskUpdateCursor = { time: number; source: number; id: number };
/** A work stretch as History recorded it; endedAt is null while it was still open. */
export type TaskWorkInterval = { startedAt: number; endedAt: number | null };
/** Every kind History records, from Rust, SQL triggers, and derived rows. */
export type TaskUpdateKind =
  | "created" | "status" | "title" | "description" | "scope" | "value" | "effort"
  | "parent_set" | "parent_removed" | "child_added" | "child_removed"
  | "blocker_added" | "blocker_removed" | "dependent_added" | "dependent_removed"
  | "follows" | "follow_up" | "follows_removed" | "follow_up_removed"
  | "work_started" | "work_stopped" | "work_corrected" | "work_removed";
export type TaskUpdate = {
  cursor: TaskUpdateCursor;
  kind: TaskUpdateKind;
  beforeValue: string | null;
  afterValue: string | null;
  /** Set instead of the text values for work corrections and removals. */
  workBefore: TaskWorkInterval | null;
  workAfter: TaskWorkInterval | null;
  relatedTaskId: number | null;
  relatedTitle: string | null;
};
export type TaskUpdatePage = {
  updates: TaskUpdate[];
  hasMore: boolean;
  recordingStartedAt: number;
};
