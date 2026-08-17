import type {
  MetricCheckInWithRatings,
  Phase,
  Task,
  TaskStatusEvent,
} from "../../lib/types";
import type { PhaseTotal } from "./timeline";

export const LIVE_PHASE_NAMES = ["Doing", "Scoping", "Resting", "Offline"] as const;

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

/** Always four live Phases so a quiet window still reads as 0, not missing. */
export const filledPhaseTotals = (
  totals: PhaseTotal[],
  phases: Phase[],
): PhaseTotal[] => {
  const secondsByName = new Map<string, number>();
  for (const row of foldIdleIntoOffline(totals, phases)) {
    const name = phaseName(row.phaseId, phases);
    const live = name === "Idle" ? "Offline" : name;
    secondsByName.set(live, (secondsByName.get(live) ?? 0) + row.seconds);
  }
  return LIVE_PHASE_NAMES.map((name) => ({
    phaseId: phases.find((phase) => phase.name === name)?.id ?? null,
    seconds: secondsByName.get(name) ?? 0,
  }));
};

/** Count Idle (null Phase) as Offline so summaries use the four live values. */
export const foldIdleIntoOffline = (
  totals: PhaseTotal[],
  phases: Phase[],
): PhaseTotal[] => {
  const offlineId = phases.find((phase) => phase.name === "Offline")?.id;
  if (offlineId === undefined) return totals;
  const secondsByPhase = new Map<number | null, number>();
  for (const row of totals) {
    const phaseId = row.phaseId === null ? offlineId : row.phaseId;
    secondsByPhase.set(
      phaseId,
      (secondsByPhase.get(phaseId) ?? 0) + row.seconds,
    );
  }
  return [...secondsByPhase].map(([phaseId, seconds]) => ({ phaseId, seconds }));
};
