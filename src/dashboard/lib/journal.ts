import type {
  MetricCheckInWithRatings,
  Phase,
  Task,
  TaskStatusEvent,
} from "../../lib/types";
import type { PhaseTotal } from "./timeline";

export const PHASE_ORDER = ["Doing", "Scoping", "Resting", "Offline", "Idle"];

export type Period = { from: number; to: number };

const inPeriod = (at: number, period: Period) =>
  at >= period.from && at < period.to;

export type CompletionTotals = {
  completed: number;
  value: number;
  effort: number;
  valueScored: number;
  effortScored: number;
};

/**
 * What a day actually recorded: every task with a completion event inside the
 * period, not each task's latest completion. A task completed and later
 * reopened still counts on the day it was completed; completing it twice in
 * one day still counts once. Scores are the task's current ones.
 */
export function completionTotals(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): CompletionTotals {
  const completedIds = new Set<number>();
  for (const event of events) {
    if (event.toStatus === "completed" && inPeriod(event.createdAt, period)) {
      completedIds.add(event.taskId);
    }
  }

  const totals: CompletionTotals = {
    completed: 0,
    value: 0,
    effort: 0,
    valueScored: 0,
    effortScored: 0,
  };
  for (const task of tasks) {
    if (!completedIds.has(task.id)) continue;
    totals.completed += 1;
    if (task.value !== null) {
      totals.value += task.value;
      totals.valueScored += 1;
    }
    if (task.effort !== null) {
      totals.effort += task.effort;
      totals.effortScored += 1;
    }
  }
  return totals;
}

export const countCheckIns = (
  checkIns: MetricCheckInWithRatings[],
  period: Period,
) => checkIns.filter((checkIn) => inPeriod(checkIn.createdAt, period)).length;

export const phaseName = (
  phaseId: number | null,
  phases: Phase[],
  fallback?: string | null,
) => {
  if (phaseId === null) return "Idle";
  return (
    phases.find((phase) => phase.id === phaseId)?.name ??
    fallback ??
    `Phase ${phaseId}`
  );
};

export const phaseTone = (name: string) => {
  const tone = name.toLowerCase();
  if (
    tone === "doing" ||
    tone === "scoping" ||
    tone === "resting" ||
    tone === "offline" ||
    tone === "idle"
  ) {
    return tone;
  }
  return "unknown";
};

export const isQuietPhase = (phaseId: number | null, phases: Phase[]) => {
  if (phaseId === null) return true;
  const name = phases.find((phase) => phase.id === phaseId)?.name;
  return name === "Resting" || name === "Offline";
};

export const sortPhaseTotals = (totals: PhaseTotal[], phases: Phase[]) =>
  [...totals]
    .filter((row) => row.seconds > 0)
    .sort((a, b) => {
      const aOrder = PHASE_ORDER.indexOf(phaseName(a.phaseId, phases));
      const bOrder = PHASE_ORDER.indexOf(phaseName(b.phaseId, phases));
      return (
        (aOrder === -1 ? PHASE_ORDER.length : aOrder) -
        (bOrder === -1 ? PHASE_ORDER.length : bOrder)
      );
    });
