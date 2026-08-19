import type { Phase } from "../../lib/types";
import { NestIcon } from "./PulseIcon";
import {
  filledPhaseTotals,
  LIVE_PHASE_NAMES,
  phaseIconName,
  phaseTone,
} from "../lib/period";
import { formatCompactDuration } from "../lib/time";
import { phaseSessionTotals, type PhaseSession } from "../lib/timeline";

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
            <span className="day-group__total-icon" aria-hidden="true">
              <NestIcon name={phaseIconName(name)} />
            </span>
            {name} {formatCompactDuration(row.seconds)}
          </span>
        );
      })}
    </p>
  );
}

/** Proportional Phase mix for the range, with the duration chips under it. */
export function PhaseMix({
  sessions,
  phases,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
}) {
  const totals = filledPhaseTotals(phaseSessionTotals(sessions), phases);
  const sum = totals.reduce((seconds, row) => seconds + row.seconds, 0);

  return (
    <div className="insight-mix">
      <div className="insight-mix__bar" aria-hidden="true">
        {sum === 0 ? (
          <span className="insight-mix__empty" />
        ) : (
          totals.map((row, index) => {
            if (row.seconds <= 0) return null;
            const name = LIVE_PHASE_NAMES[index];
            return (
              <span
                key={name}
                className={`insight-mix__seg insight-mix__seg--${phaseTone(name)}`}
                style={{ flexGrow: row.seconds }}
              />
            );
          })
        )}
      </div>
      <PhaseTotals sessions={sessions} phases={phases} />
    </div>
  );
}
