import type {
  BrainDump,
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
import { dayLabel, formatTime, shiftDayMs, startOfDayMs } from "./time";
import { workTotalsInSpan, type WorkBlock } from "./workTimeline";

export type InsightBrainDumpSummary = {
  count: number;
  tags: { id: number; name: string; count: number }[];
  untaggedCount: number;
};

export function insightBrainDumps(
  brainDumps: BrainDump[],
  period: Period,
): InsightBrainDumpSummary {
  const dumps = brainDumps.filter(
    (dump) => dump.createdAt >= period.from && dump.createdAt < period.to,
  );
  const tags = new Map<number, InsightBrainDumpSummary["tags"][number]>();
  for (const dump of dumps) {
    for (const tag of dump.tags) {
      const existing = tags.get(tag.id);
      if (existing) existing.count += 1;
      else tags.set(tag.id, { ...tag, count: 1 });
    }
  }
  return {
    count: dumps.length,
    tags: [...tags.values()].sort(
      (a, b) => b.count - a.count || a.name.localeCompare(b.name),
    ),
    untaggedCount: dumps.filter((dump) => dump.tags.length === 0).length,
  };
}

export const RANGE_MODES = [
  { key: "day", label: "Day" },
  { key: "week", label: "Week" },
] as const;

export type RangeModeKey = (typeof RANGE_MODES)[number]["key"];

export const LAST_HOUR_WINDOW_SECONDS = 60 * 60;

export const INSIGHTS_RANGE_MODES = [
  ...RANGE_MODES,
  { key: "lastHour", label: "Last hour" },
] as const;

export type InsightsRangeMode = (typeof INSIGHTS_RANGE_MODES)[number]["key"];

const RANGE_MODE_KEY = "nest:date-range";
const LEGACY_RANGE_MODE_KEY = "nest:insights-range";
const INSIGHTS_RANGE_MODE_KEY = "nest:insights-range-mode";
const MODE_KEYS = new Set<string>(RANGE_MODES.map((item) => item.key));
const INSIGHTS_MODE_KEYS = new Set<string>(
  INSIGHTS_RANGE_MODES.map((item) => item.key),
);

type RangeStorage = Pick<Storage, "getItem" | "setItem">;

export const readRangeMode = (
  storage: RangeStorage = localStorage,
): RangeModeKey => {
  const stored =
    storage.getItem(RANGE_MODE_KEY) ?? storage.getItem(LEGACY_RANGE_MODE_KEY);
  return MODE_KEYS.has(stored ?? "") ? (stored as RangeModeKey) : "day";
};

export const writeRangeMode = (
  key: RangeModeKey,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(RANGE_MODE_KEY, key);
};

/**
 * Insights keeps its own range so choosing Week there leaves Calendar alone.
 * Until Insights has saved a Day or Week it starts from Calendar's choice,
 * which is what the two used to share.
 */
export const readInsightsRangeMode = (
  storage: RangeStorage = localStorage,
): InsightsRangeMode => {
  const stored = storage.getItem(INSIGHTS_RANGE_MODE_KEY);
  return INSIGHTS_MODE_KEYS.has(stored ?? "")
    ? (stored as InsightsRangeMode)
    : readRangeMode(storage);
};

export const writeInsightsRangeMode = (
  key: InsightsRangeMode,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(INSIGHTS_RANGE_MODE_KEY, key);
};

/** Where one Day / Week range hook reads and saves its mode. */
export type RangeModeStore = {
  read: () => RangeModeKey;
  write: (key: RangeModeKey) => void;
};

export const CALENDAR_RANGE_STORE: RangeModeStore = {
  read: () => readRangeMode(),
  write: (key) => writeRangeMode(key),
};

/** Last hour has no Day / Week of its own; leaving it by picking a date lands on Day. */
export const INSIGHTS_RANGE_STORE: RangeModeStore = {
  read: () => (readInsightsRangeMode() === "week" ? "week" : "day"),
  write: (key) => writeInsightsRangeMode(key),
};

/** Rolling hour ending at `nowSec`, half-open `[from, to)`. */
export const lastHourPeriod = (nowSec: number): Period => ({
  from: nowSec - LAST_HOUR_WINDOW_SECONDS,
  to: nowSec,
});

/** One calendar day of the grid: real local midnight to real local midnight,
 * so a DST day is 23 or 25 hours long and blocks still land correctly. */
export type InsightColumn = { from: number; to: number; label: string };

/** The clock span Last hour covers, e.g. "2:04 PM – 3:04 PM". */
export const lastHourSpanLabel = (nowSec: number) => {
  const { from, to } = lastHourPeriod(nowSec);
  return `${formatTime(from)} – ${formatTime(to)}`;
};

export const lastHourColumn = (nowSec: number): InsightColumn => {
  const period = lastHourPeriod(nowSec);
  return { ...period, label: "Last hour" };
};

/** Monday-first start of the week holding `dayMs`. */
const startOfWeekMs = (dayMs: number) =>
  shiftDayMs(dayMs, -((new Date(dayMs).getDay() + 6) % 7));

/** How far the anchor moves per step, and how many columns it shows. */
export const MODE_DAYS: Record<RangeModeKey, number> = { day: 1, week: 7 };

/** The columns the grid draws for `mode` around `anchorMs` (any instant in the
 * focused day). Week snaps to Monday so paging lands on whole weeks. */
export const insightColumns = (
  mode: RangeModeKey,
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
  mode: RangeModeKey,
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

/** Untrimmed: quiet edges stay as empty track rather than being squeezed out. */
export const windowPhaseSessions = (
  phaseCheckIns: PhaseCheckIn[],
  phases: Phase[],
  fromSec: number,
  toSec: number,
): PhaseSession[] =>
  phaseSessionsInWindow(
    phaseCheckIns,
    fromSec,
    toSec,
    (phaseId) => isQuietPhase(phaseId, phases),
    false,
  );

export const windowInsight = (
  tasks: Task[],
  events: TaskStatusEvent[],
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  phases: Phase[],
  fromSec: number,
  toSec: number,
): WindowInsight => ({
  stats: outcomeStats(tasks, events, checkIns, { from: fromSec, to: toSec }),
  sessions: windowPhaseSessions(phaseCheckIns, phases, fromSec, toSec),
});

/** Last hour tile and Insights Last hour use the same rolling window. */
export const lastHourInsight = (
  tasks: Task[],
  events: TaskStatusEvent[],
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  phases: Phase[],
  nowSec: number,
): WindowInsight => {
  const { from, to } = lastHourPeriod(nowSec);
  return windowInsight(
    tasks,
    events,
    checkIns,
    phaseCheckIns,
    phases,
    from,
    to,
  );
};

export type InsightTaskRow = { task: Task; seconds: number };

/** What happened to a Task over a range. Exclusive and exhaustive by
 * construction: a Task has one status at the range's end, and anything not
 * closed there is Incomplete. */
export type InsightOutcome = "completed" | "cancelled" | "incomplete";

export const INSIGHT_OUTCOME_LABEL: Record<InsightOutcome, string> = {
  completed: "Completed",
  cancelled: "Cancelled",
  incomplete: "Incomplete",
};

export type InsightOutcomeGroup = {
  outcome: InsightOutcome;
  rows: InsightTaskRow[];
  /** Worked time of every row, so a collapsed group still reads as one total. */
  seconds: number;
};

const INSIGHT_OUTCOME_ORDER: InsightOutcome[] = [
  "completed",
  "cancelled",
  "incomplete",
];

const asLiveStatus = (
  status: RecordedTaskStatus | null,
  fallback: TaskStatus,
): TaskStatus => {
  if (status === "paused") return "active";
  return status ?? fallback;
};

/** Status at `at`. A change after the range must not rewrite its outcome. */
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

const outcomeAt = (
  task: Task,
  events: TaskStatusEvent[],
  at: number,
): InsightOutcome => {
  const status = statusAt(task, events, at);
  return status === "completed" || status === "cancelled"
    ? status
    : "incomplete";
};

/** Tasks with Worked time in the range, plus Tasks closed in it and still
 * closed at its end. A closure later reopened says nothing on its own, so
 * without Worked time it is left out. */
const ledgerRows = (
  worked: InsightTaskRow[],
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): InsightTaskRow[] => {
  const byId = new Map(worked.map((row) => [row.task.id, row]));
  for (const task of completedInPeriod(tasks, events, period)) {
    if (outcomeAt(task, events, period.to) !== "completed") continue;
    if (!byId.has(task.id)) byId.set(task.id, { task, seconds: 0 });
  }
  for (const task of cancelledInPeriod(tasks, events, period)) {
    if (outcomeAt(task, events, period.to) !== "cancelled") continue;
    if (!byId.has(task.id)) byId.set(task.id, { task, seconds: 0 });
  }
  return [...byId.values()];
};

const groupByOutcome = (
  rows: InsightTaskRow[],
  events: TaskStatusEvent[],
  period: Period,
): InsightOutcomeGroup[] => {
  const buckets = new Map<InsightOutcome, InsightTaskRow[]>();
  for (const row of rows) {
    const outcome = outcomeAt(row.task, events, period.to);
    const list = buckets.get(outcome);
    if (list) list.push(row);
    else buckets.set(outcome, [row]);
  }
  return INSIGHT_OUTCOME_ORDER.map((outcome) => {
    const rows = [...(buckets.get(outcome) ?? [])].sort(
      (a, b) => b.seconds - a.seconds || a.task.id - b.task.id,
    );
    return {
      outcome,
      rows,
      seconds: rows.reduce((sum, row) => sum + row.seconds, 0),
    };
  });
};

/** The range's ledger, grouped by what happened to each Task: Completed or
 * Cancelled when it ends the range closed, otherwise Incomplete. All three
 * groups always return, in that order, so an empty one still shows.
 * Completions and Cancellations with no Working now still list, with 0 Worked
 * time. Week sums each Task across its days. */
export const insightTaskGroups = (
  range: Period,
  blocks: WorkBlock[],
  tasks: Task[],
  events: TaskStatusEvent[],
  nowSec: number,
): InsightOutcomeGroup[] => {
  const period = { from: range.from, to: Math.min(range.to, nowSec) };
  const rows =
    nowSec < range.from
      ? []
      : ledgerRows(
          workTotalsInSpan(blocks, period.from, period.to),
          tasks,
          events,
          period,
        );
  return groupByOutcome(rows, events, period);
};

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
  /** Mean of every rating in the group, so a collapsed Pulse still reads as one
   * number. Null when its check-ins carry no ratings. */
  average: number | null;
  metrics: InsightMetricRow[];
};

const average = (values: number[]) =>
  values.reduce((sum, value) => sum + value, 0) / values.length;

/** Exclusive end for Insights check-ins. Live now + 1 matches dashboard reload
 * (`to = now + 1`) against `createdAt < to`, so a just-saved rating is not held
 * by the minute clock. Last hour's range end *is* that clock, so `live` must
 * not clamp to it. A past range stays closed at its own end. */
export const insightCheckInClosedTo = (
  rangeTo: number,
  nowMs: number,
  live = false,
) => {
  const liveTo = Math.floor(nowMs / 1000) + 1;
  return live ? liveTo : Math.min(rangeTo, liveTo);
};

/** Metric check-ins in the range, grouped by Pulse, ratings in time order.
 * Every current Pulse is listed, including one with no check-ins in the range. */
export const insightCheckIns = (
  checkIns: MetricCheckInWithRatings[],
  metrics: Metric[],
  pulses: Pulse[],
  period: Period,
): InsightPulseGroup[] => {
  const inRange = checkIns
    .filter((checkIn) => checkIn.createdAt >= period.from && checkIn.createdAt < period.to)
    .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id);

  const metricById = new Map(metrics.map((metric) => [metric.id, metric]));
  const pulseById = new Map(pulses.map((pulse) => [pulse.id, pulse]));
  const pulseIndex = new Map(pulses.map((pulse, index) => [pulse.id, index]));
  const groups = new Map<number | null, MetricCheckInWithRatings[]>(
    pulses.map((pulse) => [pulse.id, []]),
  );
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
      name: pulse?.name ?? items[0]?.pulseName ?? "Metric check-in",
      icon: pulse?.icon ?? "activity",
      checkInCount: items.length,
      average: valuesByMetric.size > 0
        ? average([...valuesByMetric.values()].flat())
        : null,
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
