import type {
  BrainDump,
  MetricCheckInWithRatings,
  PhaseCheckIn,
} from "../../lib/types";
import { dayLabel, startOfDayMs } from "./time";

export type TimelineEvent =
  | { kind: "metrics"; at: number; checkIn: MetricCheckInWithRatings }
  | { kind: "phase"; at: number; checkIn: PhaseCheckIn }
  | { kind: "dump"; at: number; dump: BrainDump };

export type DayGroup = { key: number; label: string; events: TimelineEvent[] };

// A popup submit writes phase, then metrics, then the brain dump within the
// same second — rank them so the feed still reads newest-first.
const KIND_RANK: Record<TimelineEvent["kind"], number> = {
  dump: 0,
  metrics: 1,
  phase: 2,
};

// Merge the three event sources into a single newest-first timeline.
export const buildTimeline = (
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
): TimelineEvent[] => {
  const all: TimelineEvent[] = [
    ...checkIns.map((ci) => ({
      kind: "metrics" as const,
      at: ci.createdAt,
      checkIn: ci,
    })),
    ...phaseCheckIns.map((ci) => ({
      kind: "phase" as const,
      at: ci.createdAt,
      checkIn: ci,
    })),
    ...brainDumps.map((d) => ({
      kind: "dump" as const,
      at: d.createdAt,
      dump: d,
    })),
  ];
  return all.sort(
    (a, b) => b.at - a.at || KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
};

// Collapse a newest-first timeline into per-day groups (preserving order).
export const groupByDay = (
  events: TimelineEvent[],
  nowMs: number = Date.now(),
): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const ev of events) {
    const key = startOfDayMs(ev.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(ev);
    else groups.push({ key, label: dayLabel(ev.at, nowMs), events: [ev] });
  }
  return groups;
};

// Per-metric rating values in chronological order, for sparklines and stats.
export const buildMetricSeries = (
  checkIns: MetricCheckInWithRatings[],
): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  const chronological = [...checkIns].sort((a, b) => a.createdAt - b.createdAt);
  for (const ci of chronological) {
    for (const r of ci.ratings) {
      const values = map.get(r.metricId);
      if (values) values.push(r.value);
      else map.set(r.metricId, [r.value]);
    }
  }
  return map;
};
