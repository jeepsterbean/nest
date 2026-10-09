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
