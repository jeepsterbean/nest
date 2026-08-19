import type {
  BrainDump,
  MetricCheckInWithRatings,
  PhaseCheckIn,
} from "../../lib/types";
import { dayLabel, startOfDayMs } from "./time";

export type TimelineEvent =
  | { kind: "metrics"; at: number; checkIn: MetricCheckInWithRatings }
  | { kind: "phase"; at: number; checkIn: PhaseCheckIn }
  | { kind: "dump"; at: number; dump: BrainDump };

export type DayGroup = { key: number; label: string; events: TimelineEvent[] };

export type PhaseSession = {
  phaseId: number | null;
  from: number;
  to: number;
};

export type PhaseTotal = { phaseId: number | null; seconds: number };

// Window-switching writes a checkpoint per change; bursts inside this window
// are still settling, not a journal-worthy beat.
export const PHASE_SETTLE_SECONDS = 60;

// Independent popup submissions can land in the same second; rank them so the
// feed remains deterministic and easy to scan.
const KIND_RANK: Record<TimelineEvent["kind"], number> = {
  dump: 0,
  metrics: 1,
  phase: 2,
};

// Merge the three event sources into a single newest-first timeline.
export const buildTimeline = (
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
): TimelineEvent[] => {
  const all: TimelineEvent[] = [
    ...checkIns.map((ci) => ({
      kind: "metrics" as const,
      at: ci.createdAt,
      checkIn: ci,
    })),
    ...phaseCheckIns.map((ci) => ({
      kind: "phase" as const,
      at: ci.createdAt,
      checkIn: ci,
    })),
    ...brainDumps.map((d) => ({
      kind: "dump" as const,
      at: d.createdAt,
      dump: d,
    })),
  ];
  return all.sort(
    (a, b) => b.at - a.at || KIND_RANK[a.kind] - KIND_RANK[b.kind],
  );
};

// Collapse a newest-first timeline into per-day groups (preserving order).
export const groupByDay = (
  events: TimelineEvent[],
  nowMs: number = Date.now(),
): DayGroup[] => {
  const groups: DayGroup[] = [];
  for (const ev of events) {
    const key = startOfDayMs(ev.at);
    const last = groups[groups.length - 1];
    if (last && last.key === key) last.events.push(ev);
    else groups.push({ key, label: dayLabel(ev.at, nowMs), events: [ev] });
  }
  return groups;
};

const byTimeThenId = (a: PhaseCheckIn, b: PhaseCheckIn) =>
  a.createdAt - b.createdAt || a.id - b.id;

/** Phase in effect at `at` (latest checkpoint at or before that instant). */
function phaseAt(checkIns: PhaseCheckIn[], at: number): number | null {
  let result: PhaseCheckIn | null = null;
  for (const checkIn of checkIns) {
    if (
      checkIn.createdAt <= at &&
      (!result ||
        checkIn.createdAt > result.createdAt ||
        (checkIn.createdAt === result.createdAt && checkIn.id > result.id))
    ) {
      result = checkIn;
    }
  }
  return result?.phaseId ?? null;
}

// Drop attention flickers: a burst of checkpoints within settleSeconds collapses
// to the phase it landed on. If that equals the phase before the burst, omit it.
export const collapsePhaseCheckIns = (
  checkIns: PhaseCheckIn[],
  settleSeconds: number = PHASE_SETTLE_SECONDS,
): PhaseCheckIn[] => {
  const ordered = [...checkIns].sort(byTimeThenId);
  if (ordered.length === 0) return [];

  const clusters: PhaseCheckIn[][] = [];
  let cluster: PhaseCheckIn[] = [ordered[0]];
  for (let i = 1; i < ordered.length; i++) {
    const checkIn = ordered[i];
    const previous = cluster[cluster.length - 1];
    if (checkIn.createdAt - previous.createdAt <= settleSeconds) {
      cluster.push(checkIn);
    } else {
      clusters.push(cluster);
      cluster = [checkIn];
    }
  }
  clusters.push(cluster);

  const settled: PhaseCheckIn[] = [];
  let priorPhaseId: number | null | undefined;
  for (const group of clusters) {
    const last = group[group.length - 1];
    if (priorPhaseId === last.phaseId) continue;
    settled.push(last);
    priorPhaseId = last.phaseId;
  }
  return settled;
};

// Ordered stretches of a (usually collapsed) checkpoint list, clipped to [from, to).
export const phaseSessions = (
  checkIns: PhaseCheckIn[],
  from: number,
  to: number,
): PhaseSession[] => {
  if (to <= from) return [];
  const ordered = [...checkIns].sort(byTimeThenId);
  const sessions: PhaseSession[] = [];
  let started = ordered.some((checkIn) => checkIn.createdAt <= from);
  let activePhase = phaseAt(ordered, from);
  let cursor = from;

  if (!started) {
    const first = ordered.find(
      (checkIn) => checkIn.createdAt > from && checkIn.createdAt < to,
    );
    if (!first) return [];
    activePhase = first.phaseId;
    cursor = first.createdAt;
    started = true;
  }

  for (const checkIn of ordered) {
    if (checkIn.createdAt <= cursor) continue;
    if (checkIn.createdAt >= to) break;
    if (checkIn.createdAt > cursor) {
      sessions.push({
        phaseId: activePhase,
        from: cursor,
        to: checkIn.createdAt,
      });
    }
    activePhase = checkIn.phaseId;
    cursor = checkIn.createdAt;
  }
  if (started && cursor < to) {
    sessions.push({ phaseId: activePhase, from: cursor, to });
  }
  return sessions.filter((session) => session.to > session.from);
};

export const phaseSessionTotals = (sessions: PhaseSession[]): PhaseTotal[] => {
  const secondsByPhase = new Map<number | null, number>();
  for (const session of sessions) {
    secondsByPhase.set(
      session.phaseId,
      (secondsByPhase.get(session.phaseId) ?? 0) + (session.to - session.from),
    );
  }
  return [...secondsByPhase].map(([phaseId, seconds]) => ({ phaseId, seconds }));
};

// Drop leading/trailing Resting, Offline, or Idle so only the engaged span remains.
export const trimQuietPhaseSessions = (
  sessions: PhaseSession[],
  isQuiet: (phaseId: number | null) => boolean,
): PhaseSession[] => {
  let start = 0;
  let end = sessions.length;
  while (start < end && isQuiet(sessions[start].phaseId)) start += 1;
  while (end > start && isQuiet(sessions[end - 1].phaseId)) end -= 1;
  return sessions.slice(start, end);
};

const isQuietDefault = (phaseId: number | null) => phaseId === null;

/** Settled phase sessions for a time window. */
export const phaseSessionsInWindow = (
  phaseCheckIns: PhaseCheckIn[],
  fromSec: number,
  toSec: number,
  isQuiet: (phaseId: number | null) => boolean = isQuietDefault,
  trimQuiet: boolean = true,
): PhaseSession[] => {
  const sessions = phaseSessions(
    collapsePhaseCheckIns(phaseCheckIns),
    fromSec,
    toSec,
  );
  return trimQuiet ? trimQuietPhaseSessions(sessions, isQuiet) : sessions;
};

// Per-metric rating values in chronological order, for sparklines and stats.
export const buildMetricSeries = (
  checkIns: MetricCheckInWithRatings[],
): Map<number, number[]> => {
  const map = new Map<number, number[]>();
  const chronological = [...checkIns].sort((a, b) => a.createdAt - b.createdAt);
  for (const ci of chronological) {
    for (const r of ci.ratings) {
      const values = map.get(r.metricId);
      if (values) values.push(r.value);
      else map.set(r.metricId, [r.value]);
    }
  }
  return map;
};
