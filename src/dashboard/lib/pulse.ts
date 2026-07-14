import type {
  Metric,
  MetricCheckInWithRatings,
} from "../../lib/types";

const PULSE_STALE_SECONDS = 60 * 60;

const joinNames = (names: string[]) => {
  if (names.length === 1) return names[0];
  if (names.length === 2) return `${names[0]} and ${names[1]}`;
  return `${names.slice(0, -1).join(", ")}, and ${names[names.length - 1]}`;
};

export const latestPulseState = (
  checkIns: MetricCheckInWithRatings[],
  metrics: Metric[],
  nowMs: number = Date.now(),
) => {
  const latest = checkIns.reduce<MetricCheckInWithRatings | null>(
    (current, checkIn) =>
      current === null ||
      checkIn.createdAt > current.createdAt ||
      (checkIn.createdAt === current.createdAt && checkIn.id > current.id)
        ? checkIn
        : current,
    null,
  );

  if (
    latest === null ||
    nowMs / 1000 - latest.createdAt >= PULSE_STALE_SECONDS
  ) {
    return {
      message: "Time for a pulse check-in",
      overdue: true,
    };
  }

  const metricNames = new Map(metrics.map((metric) => [metric.id, metric.name]));
  const lowNames = latest.ratings
    .filter((rating) => rating.value < 3)
    .map(
      (rating) =>
        metricNames.get(rating.metricId) ?? `Metric ${rating.metricId}`,
    );

  return {
    message:
      lowNames.length === 0
        ? "All looking steady"
        : `${joinNames(lowNames)} ${lowNames.length === 1 ? "is" : "are"} low`,
    overdue: false,
  };
};

export const latestPulseMessage = (
  checkIns: MetricCheckInWithRatings[],
  metrics: Metric[],
  nowMs: number = Date.now(),
) => latestPulseState(checkIns, metrics, nowMs).message;
