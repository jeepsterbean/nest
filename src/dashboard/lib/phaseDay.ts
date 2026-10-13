// Behavior and invariants: docs/interface/phases.md#day
import type { Phase, PhaseCheckIn } from "../../lib/types";
import { windowPhaseSessions } from "./insights";
import { dayOffset } from "./metricDay";
import { LIVE_PHASE_NAMES, phaseName } from "./period";

export type PhaseDaySession = {
  from: number;
  to: number;
  /** Position across the day, 0 at local midnight and 1 at the next. */
  startOffset: number;
  endOffset: number;
};

export type PhaseDayRow = {
  name: (typeof LIVE_PHASE_NAMES)[number];
  phase: Phase | null;
  seconds: number;
  sessions: PhaseDaySession[];
};

export const PHASE_VIEWS = [
  { key: "day", label: "Day" },
  { key: "guide", label: "Guide" },
] as const;

export type PhaseView = (typeof PHASE_VIEWS)[number]["key"];

const PHASE_VIEW_KEY = "nest:phase-view";

type ViewStorage = Pick<Storage, "getItem" | "setItem">;

/** Day is the default Phases layout. An unknown stored value falls back. */
export const readPhaseView = (storage: ViewStorage = localStorage): PhaseView =>
  storage.getItem(PHASE_VIEW_KEY) === "guide" ? "guide" : "day";

export const writePhaseView = (
  view: PhaseView,
  storage: ViewStorage = localStorage,
) => {
  storage.setItem(PHASE_VIEW_KEY, view);
};

/** One row per live Phase, 0m included, holding its settled sessions for the
 * day. Sessions stop at now, since the last checkpoint would otherwise claim
 * the rest of today, and Idle counts as Offline like every other summary. */
export const buildPhaseDay = (
  phaseCheckIns: PhaseCheckIn[],
  phases: Phase[],
  dayStartSec: number,
  dayEndSec: number,
  nowSec: number,
): PhaseDayRow[] => {
  const sessions = windowPhaseSessions(
    phaseCheckIns,
    phases,
    dayStartSec,
    Math.min(dayEndSec, nowSec),
  );
  return LIVE_PHASE_NAMES.map((name) => {
    const rowSessions = sessions
      .filter((session) => {
        const sessionName = phaseName(session.phaseId, phases);
        return (sessionName === "Idle" ? "Offline" : sessionName) === name;
      })
      .map((session) => ({
        from: session.from,
        to: session.to,
        startOffset: dayOffset(session.from, dayStartSec, dayEndSec),
        endOffset: dayOffset(session.to, dayStartSec, dayEndSec),
      }));
    return {
      name,
      phase: phases.find((phase) => phase.name === name) ?? null,
      seconds: rowSessions.reduce(
        (total, session) => total + (session.to - session.from),
        0,
      ),
      sessions: rowSessions,
    };
  });
};
