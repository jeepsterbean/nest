// Behavior and invariants: docs/domain/history.md#range-summaries
import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
} from "../../lib/types";

import { resolveMetricColorFromList } from "../../lib/metricColors";
import { isQuietPhase, type Period } from "./period";
import {
  phaseSessionsInWindow,
  type PhaseSession,
} from "./timeline";
import { dayLabel, shiftDayMs, startOfDayMs } from "./time";

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

export type RecapDateRangeStore = {
  read: () => RangeModeKey;
  write: (mode: RangeModeKey) => void;
};

const RANGE_MODE_KEY = "nest:date-range";
const LEGACY_RANGE_MODE_KEY = "nest:insights-range";

type RangeStorage = Pick<Storage, "getItem" | "setItem">;

export const RECAP_PRESENTATIONS = [
  { key: "calendar", label: "Calendar" },
  { key: "timeline", label: "Timeline" },
] as const;
export type RecapPresentation =
  (typeof RECAP_PRESENTATIONS)[number]["key"];

const RECAP_PRESENTATION_KEY = "nest:recap-presentation";
// Keys from when the Recap Section was named Calendar; read so saved choices
// carry over.
const LEGACY_RECAP_PRESENTATION_KEY = "nest:calendar-presentation";

export const readRecapPresentation = (
  storage: Pick<Storage, "getItem"> = localStorage,
): RecapPresentation => {
  const stored =
    storage.getItem(RECAP_PRESENTATION_KEY) ??
    storage.getItem(LEGACY_RECAP_PRESENTATION_KEY);
  return stored === "timeline" ? "timeline" : "calendar";
};

export const writeRecapPresentation = (
  presentation: RecapPresentation,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(RECAP_PRESENTATION_KEY, presentation);
};

/** Day unless Week is stored. */
export const readRecapDateRangeMode = (
  storage: RangeStorage = localStorage,
): RangeModeKey => {
  const stored =
    storage.getItem(RANGE_MODE_KEY) ?? storage.getItem(LEGACY_RANGE_MODE_KEY);
  return stored === "week" ? "week" : "day";
};

export const writeRecapDateRangeMode = (
  key: RangeModeKey,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(RANGE_MODE_KEY, key);
};

/** Which figure the Calendar grid draws. Work stretch is the timetable of
 * recorded work; Logs places the history icons on that same grid. */
export const CALENDAR_FIGURES = [
  { key: "stretch", label: "Work stretch" },
  { key: "logs", label: "Logs" },
] as const;
export type CalendarFigure = (typeof CALENDAR_FIGURES)[number]["key"];

const CALENDAR_FIGURE_KEY = "nest:calendar-figure";

export const readCalendarFigure = (
  storage: RangeStorage = localStorage,
): CalendarFigure =>
  storage.getItem(CALENDAR_FIGURE_KEY) === "logs" ? "logs" : "stretch";

export const writeCalendarFigure = (
  figure: CalendarFigure,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(CALENDAR_FIGURE_KEY, figure);
};

/** One calendar day of the grid: real local midnight to real local midnight,
 * so a DST day is 23 or 25 hours long and blocks still land correctly. */
export type InsightColumn = { from: number; to: number; label: string };

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
 * lives, so date navigation and history bounds cannot disagree — both
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

export type InsightTaskChange = "created" | "completed" | "cancelled";

export const INSIGHT_TASK_CHANGE_LABEL: Record<InsightTaskChange, string> = {
  created: "Created",
  completed: "Completed",
  cancelled: "Cancelled",
};

export type InsightTaskCount = { change: InsightTaskChange; count: number };

/** Tasks created in the range, and Tasks whose closing falls in it. The
 * closing-day lock is what lets current status and closed at stand in for a
 * past range, as on Tasks Day. Work stretches play no part, so every count
 * reads from one history. All three always return, in this order. */
export const insightTaskCounts = (
  tasks: Task[],
  period: Period,
): InsightTaskCount[] => {
  const within = (at: number | null) =>
    at !== null && at >= period.from && at < period.to;
  const closedAs = (status: Task["status"]) =>
    tasks.filter((task) => task.status === status && within(task.closedAt)).length;
  return [
    { change: "created", count: tasks.filter((task) => within(task.createdAt)).length },
    { change: "completed", count: closedAs("completed") },
    { change: "cancelled", count: closedAs("cancelled") },
  ];
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
 * by the minute clock. A past range stays closed at its own end. */
export const insightCheckInClosedTo = (rangeTo: number, nowMs: number) =>
  Math.min(rangeTo, Math.floor(nowMs / 1000) + 1);

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

export type InsightData = {
  tasks: Task[];
  metrics: Metric[];
  pulses: Pulse[];
  checkIns: MetricCheckInWithRatings[];
  phaseCheckIns: PhaseCheckIn[];
  phases: Phase[];
  brainDumps: BrainDump[];
};

/** `nowSec` is the clock the Phase mix stops at;
 * `checkInNowMs` is the wall clock check-ins and brain dumps stop at, so a
 * just-saved one shows without waiting on that clock. */
export type InsightClock = {
  nowSec: number;
  checkInNowMs: number;
};

export type RangeInsight = {
  sessions: PhaseSession[];
  brainDumps: InsightBrainDumpSummary;
  taskCounts: InsightTaskCount[];
  checkIns: InsightPulseGroup[];
};

/** Everything Insights shows for one range. */
export const rangeInsight = (
  data: InsightData,
  { from, to }: Period,
  { nowSec, checkInNowMs }: InsightClock,
): RangeInsight => {
  const checkInTo = insightCheckInClosedTo(to, checkInNowMs);
  return {
    sessions: windowPhaseSessions(
      data.phaseCheckIns,
      data.phases,
      from,
      Math.min(to, nowSec),
    ),
    brainDumps: insightBrainDumps(data.brainDumps, { from, to: checkInTo }),
    taskCounts: insightTaskCounts(data.tasks, { from, to }),
    checkIns: insightCheckIns(data.checkIns, data.metrics, data.pulses, {
      from,
      to: checkInTo,
    }),
  };
};
