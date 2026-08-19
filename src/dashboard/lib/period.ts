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
};

/** Tasks moved to `toStatus` inside the window, in first-move order. */
export function tasksMovedToInPeriod(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
  toStatus: Task["status"],
): Task[] {
  const taskById = new Map(tasks.map((task) => [task.id, task]));
  const seen = new Set<number>();
  const moved: Task[] = [];
  const ordered = [...events].sort(
    (a, b) => a.createdAt - b.createdAt || a.id - b.id,
  );
  for (const event of ordered) {
    if (event.toStatus !== toStatus || !inPeriod(event.createdAt, period)) {
      continue;
    }
    if (seen.has(event.taskId)) continue;
    seen.add(event.taskId);
    const task = taskById.get(event.taskId);
    if (task) moved.push(task);
  }
  return moved;
}

/**
 * Tasks with a completion event inside the window, in first-completion order.
 * A Task completed and later reopened still belongs to the window it was
 * completed; completing it twice in one window still yields it once.
 */
export function completedInPeriod(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): Task[] {
  return tasksMovedToInPeriod(tasks, events, period, "completed");
}

export function cancelledInPeriod(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): Task[] {
  return tasksMovedToInPeriod(tasks, events, period, "cancelled");
}

/**
 * What a period actually recorded: every task with a completion event inside
 * the window. Scores are the task's current ones.
 */
export function completionTotals(
  tasks: Task[],
  events: TaskStatusEvent[],
  period: Period,
): CompletionTotals {
  const totals: CompletionTotals = {
    completed: 0,
    value: 0,
    effort: 0,
  };
  for (const task of completedInPeriod(tasks, events, period)) {
    totals.completed += 1;
    if (task.value !== null) totals.value += task.value;
    if (task.effort !== null) totals.effort += task.effort;
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

/** Shared icon language for phase labels across header, Logs, and totals. */
export const phaseIconName = (name: string) => {
  switch (phaseTone(name)) {
    case "doing":
      return "target";
    case "scoping":
      return "idea";
    case "resting":
      return "coffee";
    case "offline":
    case "idle":
      return "moon";
    default:
      return "activity";
  }
};

/** Stable hue per Task, so a block and its total carry the same colour.
 * ponytail: id-hash hue, swap for a stored colour if Tasks ever get one. */
export const taskHue = (id: number) => (id * 137) % 360;

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
