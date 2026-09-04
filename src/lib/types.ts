export type Metric = {
  id: number;
  name: string;
  icon: string;
  createdAt: number;
  color: string | null;
};

export type Pulse = {
  id: number;
  name: string;
  icon: string;
  createdAt: number;
  metricIds: number[];
};

export type MetricCheckIn = {
  id: number;
  createdAt: number;
  pulseId: number | null;
  pulseName: string | null;
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
  icon: string;
  color: string | null;
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
  workedSeconds: number;
  workStartedAt: number | null;
  scope: string | null;
  value: RatingValue | null;
  effort: RatingValue | null;
  parentTaskId: number | null;
  createdAt: number;
  updatedAt: number;
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

export type TimerState = {
  intervalMinutes: number;
  nextDueAt: number;
  waitingForResponse: boolean;
};

export type BrainDump = {
  id: number;
  createdAt: number;
  text: string;
  tags: BrainDumpTag[];
};

export type BrainDumpTag = {
  id: number;
  name: string;
};

export type Tag = {
  id: number;
  name: string;
  createdAt: number;
  lastUsedAt: number | null;
};

export type Reminder = {
  id: number;
  text: string;
  active: boolean;
  createdAt: number;
};
