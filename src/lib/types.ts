export type Metric = {
  id: number;
  name: string;
  createdAt: number;
  inactiveSince: number | null;
};

export type Phase = {
  id: number;
  name: string;
  createdAt: number;
  inactiveSince: number | null;
};

export type CheckIn = {
  id: number;
  createdAt: number;
  note: string | null;
};

export type Rating = {
  checkInId: number;
  metricId: number;
  value: number;
  note: string | null;
};

export type RatingInput = {
  metricId: number;
  value: number;
  note?: string;
};

export type CheckInWithRatings = CheckIn & {
  ratings: Rating[];
};

export type SeriesPoint = {
  timestamp: number;
  value: number;
};

export type RatingValue = 1 | 2 | 3 | 4 | 5;

export type PhaseCheckIn = {
  id: number;
  createdAt: number;
  phaseId: number;
  phaseLabel: string | null;
};

export type FocusCheckIn = {
  id: number;
  createdAt: number;
  task: string;
  tryingNow: string;
  nextCheckInMinutes: number;
};
