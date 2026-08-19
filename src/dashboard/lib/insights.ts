import type {
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  RecordedTaskStatus,
  Task,
  TaskStatus,
  TaskStatusEvent,
} from "../../lib/types";
import { resolveMetricColorFromList } from "../../lib/metricColors";
import {
  cancelledInPeriod,
  completedInPeriod,
  completionTotals,
  countCheckIns,
  isQuietPhase,
  type Period,
} from "./period";
import {
  phaseSessionsInWindow,
  type PhaseSession,
} from "./timeline";
import { dayLabel, shiftDayMs, startOfDayMs } from "./time";
import { workTotalsInSpan, type WorkBlock } from "./workTimeline";

export const INSIGHT_MODES = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
] as const;

export type InsightModeKey = (typeof INSIGHT_MODES)[number]["key"];

const INSIGHT_RANGE_KEY = "nest:insights-range";
const MODE_KEYS = new Set<string>(INSIGHT_MODES.map((item) => item.key));

type InsightStorage = Pick<Storage, "getItem" | "setItem">;

export const readInsightMode = (
  storage: InsightStorage = localStorage,
): InsightModeKey => {
  const stored = storage.getItem(INSIGHT_RANGE_KEY);
  return MODE_KEYS.has(stored ?? "") ? (stored as InsightModeKey) : "day";
};

export const writeInsightMode = (
  key: InsightModeKey,
  storage: InsightStorage = localStorage,
) => {
  storage.setItem(INSIGHT_RANGE_KEY, key);
};

/** One calendar day of the grid: real local midnight to real local midnight,
 * so a DST day is 23 or 25 hours long and blocks still land correctly. */
export type InsightColumn = { from: number; to: number; label: string };

/** Monday-first start of the week holding `dayMs`. */
const startOfWeekMs = (dayMs: number) =>
  shiftDayMs(dayMs, -((new Date(dayMs).getDay() + 6) % 7));

/** How far the anchor moves per step, and how many columns it shows. */
export const MODE_DAYS: Record<InsightModeKey, number> = { day: 1, week: 7 };

/** The columns the grid draws for `mode` around `anchorMs` (any instant in the
 * focused day). Week snaps to Monday so paging lands on whole weeks. */
export const insightColumns = (
  mode: InsightModeKey,
  anchorMs: number,
  nowMs: number = Date.now(),
): InsightColumn[] => {
  const start =
    mode === "week"
      ? startOfWeekMs(startOfDayMs(anchorMs / 1000))
      : startOfDayMs(anchorMs / 1000);
  return Array.from({ length: MODE_DAYS[mode] }, (_, index) => {
    const from = shiftDayMs(start, index);
    return {
      from: Math.floor(from / 1000),
      to: Math.floor(shiftDayMs(from, 1) / 1000),
      label:
        mode === "week"
          ? new Date(from).toLocaleDateString(undefined, {
              weekday: "short",
              day: "numeric",
            })
          : dayLabel(from / 1000, nowMs),
    };
  });
};

/** The page `steps` away, as its own columns. The one place paging arithmetic
 * lives, so the Earlier guard and the Earlier button cannot disagree — both
 * move by calendar days, which a fixed 86400 would get wrong across DST. */
export const stepColumns = (
  mode: InsightModeKey,
  anchorMs: number,
  steps: number,
  nowMs: number = Date.now(),
): InsightColumn[] =>
  insightColumns(mode, shiftDayMs(anchorMs, steps * MODE_DAYS[mode]), nowMs);

/** Where to open the grid vertically: the live edge when a column holds it,
 * else the first work of the range, else nowhere. A percentage of the column
 * that holds `nowSec` — never of the first column, which in Week mode is
 * Monday and would send every later weekday off the bottom. */
export const openAtPct = (
  columns: InsightColumn[],
  nowSec: number,
  firstBlockPct: number | null,
): number | null => {
  const live = columns.find(
    (column) => nowSec >= column.from && nowSec < column.to,
  );
  return live
    ? ((nowSec - live.from) / (live.to - live.from)) * 100
    : firstBlockPct;
};

export type OutcomeStat = { label: string; value: string };

export type WindowInsight = {
  stats: OutcomeStat[];
  sessions: PhaseSession[];
};

export const outcomeStats = (
  tasks: Task[],
  events: TaskStatusEvent[],
  checkIns: MetricCheckInWithRatings[],
  period: { from: number; to: number },
): OutcomeStat[] => {
  const totals = completionTotals(tasks, events, period);
  return [
    { label: "Completed", value: String(totals.completed) },
    { label: "Value", value: String(totals.value) },
    { label: "Effort", value: String(totals.effort) },
    { label: "Check-ins", value: String(countCheckIns(checkIns, period)) },
  ];
};

export const windowInsight = (
  tasks: Task[],
  events: TaskStatusEvent[],
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  phases: Phase[],
  fromSec: number,
  toSec: number,
): WindowInsight => {
  const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
  return {
    stats: outcomeStats(tasks, events, checkIns, {
      from: fromSec,
      to: toSec,
    }),
    // Untrimmed: quiet edges stay as empty track rather than being squeezed out.
    sessions: phaseSessionsInWindow(
      phaseCheckIns,
      fromSec,
      toSec,
      isQuiet,
      false,
    ),
  };
};

export type InsightTaskRow = { task: Task; seconds: number };

export type InsightStatusGroup = {
  status: TaskStatus;
  rows: InsightTaskRow[];
};

export type InsightDay = {
  label: string;
  from: number;
  to: number;
  isFuture: boolean;
  isToday: boolean;
  groups: InsightStatusGroup[];
};

/** Live work first, then closed. Omit empty statuses. */
const INSIGHT_STATUS_ORDER: TaskStatus[] = [
  "active",
  "up_next",
  "backlog",
  "completed",
  "cancelled",
];

const asLiveStatus = (
  status: RecordedTaskStatus | null,
  fallback: TaskStatus,
): TaskStatus => {
  if (status === "paused") return "active";
  return status ?? fallback;
};

/** Status at `at`. A later completion must not rewrite an earlier day's group. */
const statusAt = (
  task: Task,
  events: TaskStatusEvent[],
  at: number,
): TaskStatus => {
  const mine = [...events]
    .filter((event) => event.taskId === task.id)
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  for (const event of mine) {
    if (event.createdAt >= at) {
      return asLiveStatus(event.fromStatus, task.status);
    }
  }
  const last = mine[mine.length - 1];
  return last ? asLiveStatus(last.toStatus, task.status) : task.status;
};

const closedStatusInPeriod = (
  taskId: number,
  events: TaskStatusEvent[],
  period: Period,
): "completed" | "cancelled" | null => {
  let last: "completed" | "cancelled" | null = null;
  for (const event of events) {
    if (event.taskId !== taskId) continue;
    if (event.createdAt < period.from || event.createdAt >= period.to) continue;
    if (event.toStatus === "completed" || event.toStatus === "cancelled") {
      last = event.toStatus;
    }
  }
  return last;
};

const groupInsightTasks = (
  rows: InsightTaskRow[],
  events: TaskStatusEvent[],
  period: Period,
): InsightStatusGroup[] => {
  const buckets = new Map<TaskStatus, InsightTaskRow[]>();
  for (const row of rows) {
    const closed = closedStatusInPeriod(row.task.id, events, period);
    const status =
      row.seconds > 0
        ? statusAt(row.task, events, period.to)
        : (closed ?? statusAt(row.task, events, period.to));
    const list = buckets.get(status);
    if (list) list.push(row);
    else buckets.set(status, [row]);
  }
  return INSIGHT_STATUS_ORDER.flatMap((status) => {
    const grouped = buckets.get(status);
    if (!grouped?.length) return [];
    return [
      {
        status,
        rows: [...grouped].sort(
          (a, b) => b.seconds - a.seconds || a.task.id - b.task.id,
        ),
      },
    ];
  });
};

const mergeClosedTasks = (
  worked: InsightTaskRow[],
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): InsightTaskRow[] => {
  const byId = new Map(worked.map((row) => [row.task.id, row]));
  for (const task of [
    ...completedInPeriod(tasks, events, period),
    ...cancelledInPeriod(tasks, events, period),
  ]) {
    if (!byId.has(task.id)) byId.set(task.id, { task, seconds: 0 });
  }
  return [...byId.values()];
};

/** One ledger per calendar column: Tasks with Worked time that day, plus
 * Completions and Cancellations with no Working now, grouped by status as of
 * that day's end. Future days stay empty rather than quiet. */
export const insightDays = (
  columns: InsightColumn[],
  blocks: WorkBlock[],
  tasks: Task[],
  events: TaskStatusEvent[],
  nowSec: number,
): InsightDay[] =>
  columns.map((column) => {
    const isFuture = nowSec < column.from;
    const closedTo = Math.min(column.to, nowSec);
    const period = { from: column.from, to: closedTo };
    return {
      label: column.label,
      from: column.from,
      to: column.to,
      isFuture,
      isToday: nowSec >= column.from && nowSec < column.to,
      groups: isFuture
        ? []
        : groupInsightTasks(
            mergeClosedTasks(
              workTotalsInSpan(blocks, column.from, closedTo),
              tasks,
              events,
              period,
            ),
            events,
            period,
          ),
    };
  });

export type InsightMetricRow = {
  metricId: number;
  name: string;
  icon: string;
  color: string;
  values: number[];
  average: number;
};

export type InsightPulseGroup = {
  pulseId: number | null;
  name: string;
  icon: string;
  checkInCount: number;
  metrics: InsightMetricRow[];
};

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Metric check-ins in the range, grouped by Pulse, ratings in time order. */
export const insightCheckIns = (
  checkIns: MetricCheckInWithRatings[],
  metrics: Metric[],
  pulses: Pulse[],
  period: Period,
): InsightPulseGroup[] => {
  const inRange = checkIns
    .filter((checkIn) => checkIn.createdAt >= period.from && checkIn.createdAt < period.to)
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);
  if (inRange.length === 0) return [];

  const metricById = new Map(metrics.map((metric) => [metric.id, metric]));
  const pulseById = new Map(pulses.map((pulse) => [pulse.id, pulse]));
  const pulseIndex = new Map(pulses.map((pulse, index) => [pulse.id, index]));
  const groups = new Map<number | null, MetricCheckInWithRatings[]>();
  for (const checkIn of inRange) {
    const key = checkIn.pulseId;
    const list = groups.get(key);
    if (list) list.push(checkIn);
    else groups.set(key, [checkIn]);
  }

  const rows: InsightPulseGroup[] = [...groups].map(([pulseId, items]) => {
    const pulse = pulseId === null ? undefined : pulseById.get(pulseId);
    const valuesByMetric = new Map<number, number[]>();
    for (const checkIn of items) {
      for (const rating of checkIn.ratings) {
        const values = valuesByMetric.get(rating.metricId);
        if (values) values.push(rating.value);
        else valuesByMetric.set(rating.metricId, [rating.value]);
      }
    }
    const order = pulse?.metricIds ?? [];
    const metricIds = [
      ...order.filter((id) => valuesByMetric.has(id)),
      ...[...valuesByMetric.keys()].filter((id) => !order.includes(id)),
    ];
    return {
      pulseId,
      name: pulse?.name ?? items[0].pulseName ?? "Metric check-in",
      icon: pulse?.icon ?? "activity",
      checkInCount: items.length,
      metrics: metricIds.map((metricId) => {
        const metric = metricById.get(metricId);
        const values = valuesByMetric.get(metricId) ?? [];
        return {
          metricId,
          name: metric?.name ?? `Metric ${metricId}`,
          icon: metric?.icon ?? "activity",
          color: resolveMetricColorFromList(metrics, metricId),
          values,
          average: average(values),
        };
      }),
    };
  });

  return rows.sort((a, b) => {
    if (a.pulseId === null) return 1;
    if (b.pulseId === null) return -1;
    return (pulseIndex.get(a.pulseId) ?? 999) - (pulseIndex.get(b.pulseId) ?? 999);
  });
};
