export type Metric = {
  id: number;
  name: string;
  createdAt: number;
  inactiveSince: number | null;
};

export type MetricCheckIn = {
  id: number;
  createdAt: number;
};

export type MetricRating = {
  checkInId: number;
  metricId: number;
  value: number;
};

export type MetricRatingInput = {
  metricId: number;
  value: number;
};

export type MetricCheckInWithRatings = MetricCheckIn & {
  ratings: MetricRating[];
};

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export type Phase = {
  id: number;
  name: string;
  createdAt: number;
  inactiveSince: number | null;
};

export type PhaseCheckIn = {
  id: number;
  createdAt: number;
  phaseId: number | null;
  phaseLabel: string | null;
};

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
  scope: string | null;
  value: RatingValue | null;
  effort: RatingValue | null;
  parentTaskId: number | null;
  createdAt: number;
  updatedAt: number;
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

export type CheckInSchedule = {
  intervalMinutes: number;
  nextDueAt: number;
  waitingForResponse: boolean;
};

export type BrainDump = {
  id: number;
  createdAt: number;
  title: string | null;
  text: string;
};
