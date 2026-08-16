import type {
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Task,
  TaskStatusEvent,
} from "../../lib/types";
import { scopeMatches } from "./scope";

export const INSIGHT_RANGES = [
  { key: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { key: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
  { key: "90d", label: "90 days", seconds: 90 * 24 * 60 * 60 },
] as const;

export type InsightRangeKey = (typeof INSIGHT_RANGES)[number]["key"];

export type Period = {
  from: number;
  to: number;
};

export type Completion = {
  task: Task;
  at: number;
  phaseId: number | null;
};

export type ActivityBucket = {
  from: number;
  to: number;
  count: number;
};

export type MetricInsight = {
  metric: Metric;
  average: number | null;
  previousAverage: number | null;
  entries: number;
  previousEntries: number;
};

export type PhaseDuration = {
  phaseId: number;
  seconds: number;
};

export type PeriodSummary = {
  completions: Completion[];
  value: number;
  effort: number;
  valueScoredTasks: number;
  effortScoredTasks: number;
};

const inPeriod = (at: number, period: Period) =>
  at >= period.from && at < period.to;

export function latestCompletions(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
  selectedScope: string | null,
  phases: PhaseCheckIn[],
): Completion[] {
  const latestCompletedAt = new Map<number, number>();
  for (const event of events) {
    if (event.toStatus === "completed") {
      latestCompletedAt.set(event.taskId, event.createdAt);
    }
  }

  return tasks
    .filter(
      (task) =>
        task.status === "completed" &&
        scopeMatches(task.scope, selectedScope),
    )
    .flatMap((task) => {
      const at = latestCompletedAt.get(task.id);
      if (at === undefined || !inPeriod(at, period)) return [];
      return [{ task, at, phaseId: phaseAt(phases, at) }];
    })
    .sort((a, b) => b.at - a.at || b.task.id - a.task.id);
}

export function summarizePeriod(completions: Completion[]): PeriodSummary {
  return {
    completions,
    value: completions.reduce(
      (sum, completion) => sum + (completion.task.value ?? 0),
      0,
    ),
    effort: completions.reduce(
      (sum, completion) => sum + (completion.task.effort ?? 0),
      0,
    ),
    valueScoredTasks: completions.filter(({ task }) => task.value !== null)
      .length,
    effortScoredTasks: completions.filter(({ task }) => task.effort !== null)
      .length,
  };
}

export function buildActivityBuckets(
  completions: Completion[],
  period: Period,
  range: InsightRangeKey,
): ActivityBucket[] {
  const seconds = period.to - period.from;
  const bucketCount =
    range === "24h"
      ? 24
      : range === "7d"
        ? 7
        : range === "30d"
          ? 30
          : 30;
  const bucketSeconds = seconds / bucketCount;

  return Array.from({ length: bucketCount }, (_, index) => {
    const from = period.from + index * bucketSeconds;
    const to = index === bucketCount - 1 ? period.to : from + bucketSeconds;
    return {
      from,
      to,
      count: completions.filter((completion) =>
        inPeriod(completion.at, { from, to }),
      ).length,
    };
  });
}

export function metricInsights(
  metrics: Metric[],
  checkIns: MetricCheckInWithRatings[],
  current: Period,
  previous: Period,
): MetricInsight[] {
  const values = new Map<
    number,
    { current: number[]; previous: number[] }
  >();
  for (const metric of metrics) {
    values.set(metric.id, { current: [], previous: [] });
  }
  for (const checkIn of checkIns) {
    const target = inPeriod(checkIn.createdAt, current)
      ? "current"
      : inPeriod(checkIn.createdAt, previous)
        ? "previous"
        : null;
    if (!target) continue;
    for (const rating of checkIn.ratings) {
      values.get(rating.metricId)?.[target].push(rating.value);
    }
  }

  const average = (items: number[]) =>
    items.length
      ? items.reduce((sum, value) => sum + value, 0) / items.length
      : null;

  return metrics
    .map((metric) => {
      const series = values.get(metric.id) ?? { current: [], previous: [] };
      return {
        metric,
        average: average(series.current),
        previousAverage: average(series.previous),
        entries: series.current.length,
        previousEntries: series.previous.length,
      };
    })
    .filter((insight) => insight.entries > 0 || insight.previousEntries > 0)
    .sort(
      (a, b) =>
        a.metric.createdAt - b.metric.createdAt ||
        a.metric.id - b.metric.id,
    );
}

export function phaseAt(checkIns: PhaseCheckIn[], at: number): number | null {
  let result: PhaseCheckIn | null = null;
  for (const checkIn of checkIns) {
    if (
      checkIn.createdAt <= at &&
      (!result ||
        checkIn.createdAt > result.createdAt ||
        (checkIn.createdAt === result.createdAt && checkIn.id > result.id))
    ) {
      result = checkIn;
    }
  }
  return result?.phaseId ?? null;
}

export function phaseDurations(
  checkIns: PhaseCheckIn[],
  period: Period,
): PhaseDuration[] {
  const ordered = [...checkIns].sort(
    (a, b) => a.createdAt - b.createdAt || a.id - b.id,
  );
  const secondsByPhase = new Map<number, number>();
  let activePhase = phaseAt(ordered, period.from);
  let cursor = period.from;

  for (const checkIn of ordered) {
    if (checkIn.createdAt <= period.from) continue;
    if (checkIn.createdAt >= period.to) break;
    if (activePhase !== null) {
      secondsByPhase.set(
        activePhase,
        (secondsByPhase.get(activePhase) ?? 0) + checkIn.createdAt - cursor,
      );
    }
    activePhase = checkIn.phaseId;
    cursor = checkIn.createdAt;
  }
  if (activePhase !== null && cursor < period.to) {
    secondsByPhase.set(
      activePhase,
      (secondsByPhase.get(activePhase) ?? 0) + period.to - cursor,
    );
  }

  return [...secondsByPhase]
    .map(([phaseId, seconds]) => ({ phaseId, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.phaseId - b.phaseId);
}

export function countCheckIns(
  checkIns: MetricCheckInWithRatings[],
  period: Period,
) {
  return checkIns.filter((checkIn) => inPeriod(checkIn.createdAt, period))
    .length;
}

export function comparisonText(current: number, previous: number) {
  if (current === previous) return "same as before";
  if (previous === 0) return current === 0 ? "no change" : "new this period";
  const percent = Math.round(((current - previous) / previous) * 100);
  return `${percent > 0 ? "+" : ""}${percent}% vs before`;
}

export function notableObservations(
  current: PeriodSummary,
  previous: PeriodSummary,
  metrics: MetricInsight[],
  phases: Phase[],
): string[] {
  const observations: string[] = [];
  const phaseCounts = new Map<number, number>();
  for (const completion of current.completions) {
    if (completion.phaseId !== null) {
      phaseCounts.set(
        completion.phaseId,
        (phaseCounts.get(completion.phaseId) ?? 0) + 1,
      );
    }
  }
  const topPhase = [...phaseCounts].sort((a, b) => b[1] - a[1])[0];
  if (topPhase && current.completions.length >= 2) {
    const phase = phases.find((candidate) => candidate.id === topPhase[0]);
    if (phase) {
      observations.push(
        `${topPhase[1]} of ${current.completions.length} completions happened during ${phase.name}.`,
      );
    }
  }

  const strongestMetric = metrics
    .filter(
      (metric) =>
        metric.entries >= 2 &&
        metric.previousEntries >= 2 &&
        metric.average !== null &&
        metric.previousAverage !== null,
    )
    .map((metric) => ({
      ...metric,
      change: metric.average! - metric.previousAverage!,
    }))
    .sort((a, b) => Math.abs(b.change) - Math.abs(a.change))[0];
  if (strongestMetric && Math.abs(strongestMetric.change) >= 0.2) {
    observations.push(
      `${strongestMetric.metric.name} averaged ${Math.abs(strongestMetric.change).toFixed(1)} ${strongestMetric.change > 0 ? "higher" : "lower"} than the previous period.`,
    );
  }

  const difference =
    current.completions.length - previous.completions.length;
  if (difference !== 0) {
    observations.push(
      `${Math.abs(difference)} ${difference > 0 ? "more" : "fewer"} ${Math.abs(difference) === 1 ? "task was" : "tasks were"} completed than in the previous period.`,
    );
  }

  return observations.slice(0, 3);
}
