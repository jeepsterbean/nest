// Behavior and invariants: docs/calendar.md#phases-pane
import type { Phase } from "../../lib/types";

type PhaseGuideEntry = { name: string; meaning: string };

/**
 * Listed in the product's usual Phase order, not derivation order, so each
 * meaning states its own precedence. Mirrors `derived_phase` in
 * `src-tauri/src/phase.rs`: Doing, then Offline, then Resting on idle input,
 * then Scoping, else Resting.
 */
export const PHASE_GUIDE: readonly PhaseGuideEntry[] = [
  {
    name: "Doing",
    meaning:
      "A Task is Working now. Your Background plays behind the dashboard and popup.",
  },
  {
    name: "Scoping",
    meaning:
      "Nothing is Working now, and the dashboard has your attention, the popup is up, or Notion or Notion Calendar is in front. Three minutes without keyboard or pointer input is Resting instead, even then.",
  },
  {
    name: "Resting",
    meaning:
      "Nothing is Working now, and three minutes pass without keyboard or pointer input, whatever has attention, or your attention is outside Nest and Notion.",
  },
  {
    name: "Offline",
    meaning:
      "The Mac is locked or asleep. Working now stops, and the time worked so far is kept.",
  },
];

/** Phases in guide order; any Phase the guide omits keeps its place after. */
export function phasesInGuideOrder(phases: Phase[]): Phase[] {
  const rank = (phase: Phase) => {
    const index = PHASE_GUIDE.findIndex((entry) => entry.name === phase.name);
    return index === -1 ? PHASE_GUIDE.length : index;
  };
  return [...phases].sort((a, b) => rank(a) - rank(b));
}

export const phaseMeaning = (name: string) =>
  PHASE_GUIDE.find((entry) => entry.name === name)?.meaning ?? null;
