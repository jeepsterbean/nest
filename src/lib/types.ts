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

export type SeriesPoint = {
  timestamp: number;
  value: number;
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
  phaseId: number;
  phaseLabel: string | null;
};

export type TaskStatus =
  | "backlog"
  | "active"
  | "paused"
  | "completed"
  | "cancelled";

export type Task = {
  id: number;
  title: string;
  status: TaskStatus;
  createdAt: number;
  updatedAt: number;
  completedAt: number | null;
  cancelledAt: number | null;
};

export type TaskCheckIn = {
  id: number;
  createdAt: number;
  task: string;
};

export type CheckInSchedule = {
  intervalMinutes: number;
  nextDueAt: number;
};

export type BrainDump = {
  id: number;
  createdAt: number;
  text: string;
};
