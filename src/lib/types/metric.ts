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

/** One Metric in a Pulse being created: an existing Metric with the name,
 * icon, and color it should end up with, or a Metric to create. */
export type PulseMetricEntry =
  | { kind: "existing"; id: number; name: string; icon: string; color: string | null }
  | { kind: "new"; name: string; icon: string; color: string | null };

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
