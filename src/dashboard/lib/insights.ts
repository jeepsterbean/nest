// Behavior and invariants: docs/domain/history.md#range-summaries
import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../lib/types";

import { resolveMetricColorFromList } from "../../lib/metricColors";
import {
  cancelledInPeriod,
  completedInPeriod,
  isQuietPhase,
  taskStatusAt,
  type Period,
} from "./period";
import {
  phaseSessionsInWindow,
  type PhaseSession,
} from "./timeline";
import { dayLabel, formatTime, shiftDayMs, startOfDayMs } from "./time";
import {
  layoutWorkBlocks,
  workTotalsInSpan,
  type WorkBlock,
} from "./workTimeline";

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
const LEGACY_RECAP_INSIGHTS_KEY = "nest:calendar-display";

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

/** Day unless Week is stored. A retired Last hour value reads as Day; Last hour
 * now lives on Insights (`nest:insight-last-hour`). */
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

const INSIGHT_LAST_HOUR_KEY = "nest:insight-last-hour";

/** Insights summarizes the rolling hour instead of the Day or Week on screen. */
export const readInsightLastHour = (
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean => storage.getItem(INSIGHT_LAST_HOUR_KEY) === "on";

export const writeInsightLastHour = (
  on: boolean,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(INSIGHT_LAST_HOUR_KEY, on ? "on" : "off");
};

/** Whether Insights sits beside Calendar or Timeline. The figure itself is
 * always shown, so the stored value is a single on/off. */
const RECAP_INSIGHTS_KEY = "nest:recap-insights";

/** A missing or retired value (including the old Insights-only "insights")
 * reads as shown, so nobody lands with the summary unexpectedly hidden. The
 * legacy key stored "calendar" for hidden. */
export const readRecapInsightsShown = (
  storage: Pick<Storage, "getItem"> = localStorage,
): boolean => {
  const stored = storage.getItem(RECAP_INSIGHTS_KEY);
  if (stored !== null) return stored !== "off";
  return storage.getItem(LEGACY_RECAP_INSIGHTS_KEY) !== "calendar";
};

export const writeRecapInsightsShown = (
  shown: boolean,
  storage: RangeStorage = localStorage,
) => {
  storage.setItem(RECAP_INSIGHTS_KEY, shown ? "on" : "off");
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

const outcomeAt = (
  task: Task,
  events: TaskStatusEvent[],
  at: number,
): InsightOutcome => {
  const status = taskStatusAt(task, events, at);
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

export type InsightData = {
  tasks: Task[];
  taskStatusEvents: TaskStatusEvent[];
  taskWorkStretches: TaskWorkStretch[];
  metrics: Metric[];
  pulses: Pulse[];
  checkIns: MetricCheckInWithRatings[];
  phaseCheckIns: PhaseCheckIn[];
  phases: Phase[];
  brainDumps: BrainDump[];
};

export type InsightRange = Period & { live: boolean };

/** `nowMs` / `nowSec` are the clock Phase mix and the ledger stop at;
 * `checkInNowMs` is the wall clock check-ins and brain dumps stop at, so a
 * just-saved one shows without waiting on that clock. */
export type InsightClock = {
  nowMs: number;
  nowSec: number;
  checkInNowMs: number;
};

export type RangeInsight = {
  sessions: PhaseSession[];
  brainDumps: InsightBrainDumpSummary;
  taskGroups: InsightOutcomeGroup[];
  checkIns: InsightPulseGroup[];
};

/** Everything Insights shows for one range. */
export const rangeInsight = (
  data: InsightData,
  { from, to, live }: InsightRange,
  { nowMs, nowSec, checkInNowMs }: InsightClock,
): RangeInsight => {
  const checkInTo = insightCheckInClosedTo(to, checkInNowMs, live);
  const blocks = layoutWorkBlocks(
    data.taskWorkStretches,
    data.tasks,
    from,
    to,
    nowMs,
  );
  return {
    sessions: windowPhaseSessions(
      data.phaseCheckIns,
      data.phases,
      from,
      Math.min(to, nowSec),
    ),
    brainDumps: insightBrainDumps(data.brainDumps, { from, to: checkInTo }),
    taskGroups: insightTaskGroups(
      { from, to },
      blocks,
      data.tasks,
      data.taskStatusEvents,
      nowSec,
    ),
    checkIns: insightCheckIns(data.checkIns, data.metrics, data.pulses, {
      from,
      to: checkInTo,
    }),
  };
};
