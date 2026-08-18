import type { Phase } from "../../lib/types";
import {
  filledPhaseTotals,
  LIVE_PHASE_NAMES,
  phaseTone,
} from "../lib/journal";
import { formatCompactDuration } from "../lib/time";
import { phaseSessionTotals, type PhaseSession } from "../lib/timeline";
import { workTotals, type WorkBlock } from "../lib/workTimeline";

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

/** Worked time per Task over the range — the total each per-task lane used to
 * carry, now that blocks are labelled in place instead. */
export function TaskTotals({ blocks }: { blocks: WorkBlock[] }) {
  const totals = workTotals(blocks);
  if (totals.length === 0) return null;

  return (
    <p className="day-group__totals day-group__totals--tasks">
      {totals.map((row) => (
        <span key={row.task.id} className="day-group__total" title={row.task.title}>
          <i aria-hidden="true" />
          {row.task.title} {formatCompactDuration(row.seconds)}
        </span>
      ))}
    </p>
  );
}
