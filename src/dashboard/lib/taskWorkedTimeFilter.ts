import { formatCompactDuration, taskDisplayedWorkedSeconds } from "./time";

export const TASK_WORKED_TIME_COMPARATORS = [
  { key: "more", label: "More than" },
  { key: "less", label: "Less than" },
] as const;

export type TaskWorkedTimeComparator = (typeof TASK_WORKED_TIME_COMPARATORS)[number]["key"];

export type TaskWorkedTimeFilter = {
  comparator: TaskWorkedTimeComparator;
  seconds: number;
} | null;

/** A ~256px line stays usable around this many thumbs. Extra unique minutes are sampled. */
export const MAX_WORKED_TIME_STOPS = 16;

const MINUTE_SEC = 60;

export const roundWorkedSecondsToMinute = (seconds: number) =>
  Math.max(0, Math.floor(seconds / MINUTE_SEC) * MINUTE_SEC);

export const workedTimeStops = (
  secondsList: number[],
  maxStops: number = MAX_WORKED_TIME_STOPS,
): number[] => {
  const unique = [...new Set(secondsList.map(roundWorkedSecondsToMinute))].sort((left, right) => left - right);
  if (unique.length === 0) return [0];
  if (unique.length <= maxStops) return unique;
  const stops: number[] = [];
  for (let i = 0; i < maxStops; i++) {
    const index = Math.round((i * (unique.length - 1)) / (maxStops - 1));
    const value = unique[index]!;
    if (stops[stops.length - 1] !== value) stops.push(value);
  }
  return stops;
};

export const nearestWorkedTimeStopIndex = (stops: number[], seconds: number) => {
  if (stops.length === 0) return 0;
  let best = 0;
  let bestDist = Math.abs(stops[0]! - seconds);
  for (let i = 1; i < stops.length; i++) {
    const dist = Math.abs(stops[i]! - seconds);
    if (dist < bestDist) {
      best = i;
      bestDist = dist;
    }
  }
  return best;
};

/** Keep a persisted threshold representable even when the current Tasks produce different stops. */
export const includeWorkedTimeThreshold = (
  stops: number[],
  filter: TaskWorkedTimeFilter,
): number[] => {
  if (filter === null || stops.includes(filter.seconds)) return stops;
  return [...stops, filter.seconds].sort((left, right) => left - right);
};

export const taskMatchesWorkedTimeFilter = (
  task: { workedSeconds: number; workStartedAt: number | null; workingNow: boolean },
  filter: TaskWorkedTimeFilter,
  nowMs: number = Date.now(),
): boolean => {
  if (filter === null) return true;
  // Compare whole minutes, matching the line's stops, so 32:07 sits on 32m.
  const seconds = roundWorkedSecondsToMinute(taskDisplayedWorkedSeconds(task, nowMs));
  return filter.comparator === "more" ? seconds >= filter.seconds : seconds <= filter.seconds;
};

export const taskWorkedTimeFilterLabel = (filter: TaskWorkedTimeFilter): string | null => {
  if (filter === null) return null;
  const comparator = TASK_WORKED_TIME_COMPARATORS.find((item) => item.key === filter.comparator)?.label ?? "More than";
  return `${comparator} ${formatCompactDuration(filter.seconds)}`;
};

export const normalizeWorkedTimeFilter = (value: unknown): TaskWorkedTimeFilter => {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const record = value as Record<string, unknown>;
  if (record.comparator !== "more" && record.comparator !== "less") return null;
  if (typeof record.seconds !== "number" || !Number.isFinite(record.seconds) || record.seconds < 0) return null;
  return { comparator: record.comparator, seconds: Math.floor(record.seconds) };
};

export const sameWorkedTimeFilter = (left: TaskWorkedTimeFilter, right: TaskWorkedTimeFilter) =>
  left === right ||
  (left !== null && right !== null && left.comparator === right.comparator && left.seconds === right.seconds);
