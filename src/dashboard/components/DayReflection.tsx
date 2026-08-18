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
import { placeOnWindow } from "../lib/workTimeline";

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

/** Hour marks for a window, shared by the Phase strip and the task timeline so
 * one axis serves both. Wide spans have no room for hourly labels. */
export function TimelineTicks({ from, to }: { from: number; to: number }) {
  const span = to - from;
  const ticks = span / 3600 > 36 ? [] : hourTicks(from, to);
  if (ticks.length === 0) return null;
  return (
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
  );
}

/** Segmented phase bar laid out as a linear clock over [from, to). Segments are
 * positioned, not flex-grown, so uncovered time reads as empty track and a work
 * block with the same bounds lands on the same pixels. */
export function PhaseStrip({
  sessions,
  phases,
  from,
  to,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
  from: number;
  to: number;
}) {
  if (to <= from) return null;

  const span = to - from;
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
    <div className="journal-strip__track" role="img" aria-label={summary}>
      {sessions.map((session) => {
        const name = phaseName(session.phaseId, phases);
        const duration = session.to - session.from;
        const labeled = duration / span >= 0.14;
        const { leftPct, widthPct } = placeOnWindow(
          session.from,
          session.to,
          from,
          to,
        );
        return (
          <div
            key={`${session.from}-${session.phaseId}`}
            className={`journal-strip__seg journal-strip__seg--${phaseTone(name)}`}
            style={{ left: `${leftPct}%`, width: `${widthPct}%` }}
            title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
          >
            {labeled ? (
              <span className="journal-strip__name">{name}</span>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
