import type { Phase } from "../../lib/types";
import type { PhaseTotal } from "./timeline";

export const LIVE_PHASE_NAMES = ["Doing", "Scoping", "Resting", "Offline"] as const;

export type Period = { from: number; to: number };

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

/** Name-based defaults when a Phase has no stored icon (or Idle has no row). */
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

/** Prefer the Phase's stored icon; fall back to the name-based defaults. */
export const phaseIcon = (
  phaseId: number | null,
  phases: Phase[],
  fallbackLabel?: string | null,
) => {
  if (phaseId !== null) {
    const phase = phases.find((item) => item.id === phaseId);
    if (phase?.icon) return phase.icon;
    return phaseIconName(phase?.name ?? fallbackLabel ?? "");
  }
  return phaseIconName(fallbackLabel ?? "Idle");
};

/** User-owned Phase color, or null for the quiet / default tone. */
export const phaseColor = (phaseId: number | null, phases: Phase[]) => {
  if (phaseId === null) return null;
  return phases.find((phase) => phase.id === phaseId)?.color ?? null;
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
