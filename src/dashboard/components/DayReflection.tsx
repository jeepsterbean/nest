import type { Phase } from "../../lib/types";
import {
  filledPhaseTotals,
  LIVE_PHASE_NAMES,
  phaseName,
  phaseTone,
} from "../lib/journal";
import {
  formatCompactDuration,
  formatHourTick,
  formatTime,
} from "../lib/time";
import {
  hourTicks,
  phaseSessionTotals,
  type PhaseSession,
} from "../lib/timeline";

export type DayStat = { label: string; value: string };

/** Compact outcome numbers: value then muted label. */
export function DayStats({ stats }: { stats: DayStat[] }) {
  return (
    <dl className="day-stats">
      {stats.map((stat) => (
        <div key={stat.label} className="day-stats__cell">
          <dt>{stat.label}</dt>
          <dd>{stat.value}</dd>
        </div>
      ))}
    </dl>
  );
}

/** Duration chips for the four live Phases, including 0m. */
export function PhaseTotals({
  sessions,
  phases,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
}) {
  const totals = filledPhaseTotals(phaseSessionTotals(sessions), phases);

  return (
    <p className="day-group__totals">
      {totals.map((row, index) => {
        const name = LIVE_PHASE_NAMES[index];
        return (
          <span
            key={name}
            className={`day-group__total day-group__total--${phaseTone(name)}`}
          >
            <i aria-hidden="true" />
            {name} {formatCompactDuration(row.seconds)}
          </span>
        );
      })}
    </p>
  );
}

/** Segmented phase bar for a session window. Empty ranges still show a track. */
export function PhaseStrip({
  sessions,
  phases,
  from: windowFrom,
  to: windowTo,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
  from?: number;
  to?: number;
}) {
  const from = windowFrom ?? sessions[0]?.from;
  const to = windowTo ?? sessions[sessions.length - 1]?.to;
  if (from == null || to == null || to <= from) return null;

  const span = to - from;
  const ticks = span / 3600 > 36 ? [] : hourTicks(from, to);
  const summary =
    sessions.length === 0
      ? "No Phase time in this range"
      : sessions
          .map((session) => {
            const name = phaseName(session.phaseId, phases);
            return `${name} ${formatTime(session.from)} to ${formatTime(session.to)}`;
          })
          .join(". ");

  return (
    <div className="journal-strip" role="img" aria-label={summary}>
      <div className="journal-strip__track">
        {sessions.length === 0 ? (
          <div
            className="journal-strip__seg journal-strip__seg--idle"
            style={{ flexGrow: 1 }}
          />
        ) : (
          sessions.map((session) => {
            const name = phaseName(session.phaseId, phases);
            const duration = session.to - session.from;
            const labeled = span > 0 && duration / span >= 0.14;
            return (
              <div
                key={`${session.from}-${session.phaseId}`}
                className={`journal-strip__seg journal-strip__seg--${phaseTone(name)}`}
                style={{ flexGrow: Math.max(duration, 1) }}
                title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
              >
                {labeled ? (
                  <span className="journal-strip__name">{name}</span>
                ) : null}
              </div>
            );
          })
        )}
      </div>
      {ticks.length > 0 ? (
        <div className="journal-strip__ticks">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="journal-strip__tick"
              style={{ left: `${((tick - from) / span) * 100}%` }}
            >
              {formatHourTick(tick)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}
