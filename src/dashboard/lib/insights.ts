import type {
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Task,
  TaskStatusEvent,
} from "../../lib/types";
import {
  completionTotals,
  countCheckIns,
  isQuietPhase,
} from "./journal";
import {
  phaseSessionsInWindow,
  type PhaseSession,
} from "./timeline";
import { dayLabel, shiftDayMs, startOfDayMs } from "./time";

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
    // Untrimmed: the strip is a linear clock, so quiet edges are real empty
    // track rather than something to squeeze out.
    sessions: phaseSessionsInWindow(
      phaseCheckIns,
      fromSec,
      toSec,
      isQuiet,
      false,
    ),
  };
};
