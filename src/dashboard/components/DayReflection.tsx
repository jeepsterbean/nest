import type { CSSProperties } from "react";
import type { Phase } from "../../lib/types";
import { NestIcon } from "./PulseIcon";
import {
  filledPhaseTotals,
  LIVE_PHASE_NAMES,
  phaseColor,
  phaseIcon,
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
        const color = phaseColor(row.phaseId, phases);
        return (
          <span
            key={name}
            className={`day-group__total day-group__total--${phaseTone(name)}${
              color ? " day-group__total--colored" : ""
            }`}
            style={
              color
                ? ({ "--phase-color": color } as CSSProperties)
                : undefined
            }
          >
            <span className="day-group__total-icon" aria-hidden="true">
              <NestIcon name={phaseIcon(row.phaseId, phases, name)} />
            </span>
            {name} {formatCompactDuration(row.seconds)}
          </span>
        );
      })}
    </p>
  );
}

/** One row per live Phase, 0m included, so the four always sit in the same
 * place. */
export function PhaseMix({
  sessions,
  phases,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
}) {
  const totals = filledPhaseTotals(phaseSessionTotals(sessions), phases);

  return (
    <ul className="insight-mix" aria-label="Phase mix">
      {totals.map((row, index) => {
        const name = LIVE_PHASE_NAMES[index];
        const color = phaseColor(row.phaseId, phases);
        return (
          <li
            key={name}
            className={`insight-mix__row insight-mix__row--${phaseTone(name)}${
              color ? " insight-mix__row--colored" : ""
            }${row.seconds > 0 ? "" : " is-empty"}`}
            style={color ? ({ "--phase-color": color } as CSSProperties) : undefined}
          >
            <span className="insight-mix__name">
              <NestIcon name={phaseIcon(row.phaseId, phases, name)} />
              {name}
            </span>
            <span className="insight-mix__duration">
              {formatCompactDuration(row.seconds)}
            </span>
          </li>
        );
      })}
    </ul>
  );
}
