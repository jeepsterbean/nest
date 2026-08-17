import type { Phase } from "../../lib/types";
import type { PhaseTotal } from "./timeline";

export const PHASE_ORDER = ["Doing", "Scoping", "Resting", "Offline", "Idle"];

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
