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

export const INSIGHT_RANGES = [
  { key: "1h", label: "1 hour", seconds: 60 * 60 },
  { key: "24h", label: "24 hours", seconds: 24 * 60 * 60 },
  { key: "7d", label: "7 days", seconds: 7 * 24 * 60 * 60 },
  { key: "30d", label: "30 days", seconds: 30 * 24 * 60 * 60 },
] as const;

export type InsightRangeKey = (typeof INSIGHT_RANGES)[number]["key"];

const INSIGHT_RANGE_KEY = "nest:insights-range";
const RANGE_KEYS = new Set<string>(INSIGHT_RANGES.map((item) => item.key));

type InsightStorage = Pick<Storage, "getItem" | "setItem">;

export const readInsightRange = (
  storage: InsightStorage = localStorage,
): InsightRangeKey => {
  const stored = storage.getItem(INSIGHT_RANGE_KEY);
  return RANGE_KEYS.has(stored ?? "") ? (stored as InsightRangeKey) : "24h";
};

export const writeInsightRange = (
  key: InsightRangeKey,
  storage: InsightStorage = localStorage,
) => {
  storage.setItem(INSIGHT_RANGE_KEY, key);
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
