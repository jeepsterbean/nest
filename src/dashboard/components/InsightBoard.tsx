import { useId, useRef, useState, type CSSProperties } from "react";
import { ChevronRight } from "lucide-react";
import type { Task } from "../../lib/types";
import {
  INSIGHT_OUTCOME_LABEL,
  type InsightBrainDumpSummary,
  type InsightMetricRow,
  type InsightOutcomeGroup,
  type InsightPulseGroup,
} from "../lib/insights";
import { taskHue } from "../lib/period";
import { formatCompactDuration } from "../lib/time";
import { useScrollOverflow } from "../hooks/useScrollOverflow";
import { NestIcon } from "./PulseIcon";

export function InsightBrainDumps({ summary }: { summary: InsightBrainDumpSummary }) {
  return (
    <section className="insight-list insight-brain-dumps" aria-label="Brain dumps">
      <h3>
        Brain dumps
        <span className="insight-list__count">{summary.count}</span>
      </h3>
      {summary.count === 0 ? (
        <p className="insight-quiet">No brain dumps in this period.</p>
      ) : (
        <ul className="insight-brain-dumps__tags" aria-label="Tags">
          <li>
            <span className="insight-quiet">Untagged</span>
            <span className="insight-list__count">{summary.untaggedCount}</span>
          </li>
          {summary.tags.map((tag) => (
            <li key={tag.id}>
              <span className="brain-dump-tag" title={tag.name}>{tag.name}</span>
              <span className="insight-list__count">{tag.count}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

/** The range's Tasks, grouped by what happened to them, as ledger lines:
 * count, label, total. Every group shows, empty or not, so the ledger keeps
 * one shape from range to range; each starts collapsed. */
export function InsightLedger({ groups }: { groups: InsightOutcomeGroup[] }) {
  return (
    <div className="insight-ledger">
      {groups.map((group) => (
        <InsightOutcome key={group.outcome} group={group} />
      ))}
    </div>
  );
}

const ledgerDuration = (seconds: number) =>
  seconds > 0 ? formatCompactDuration(seconds) : "no time";

function InsightOutcome({ group }: { group: InsightOutcomeGroup }) {
  const [open, setOpen] = useState(false);
  const tasksRef = useRef<HTMLUListElement>(null);
  const overflow = useScrollOverflow(tasksRef);
  const label = INSIGHT_OUTCOME_LABEL[group.outcome];
  const isEmpty = group.rows.length === 0;
  const tasksId = useId();
  const tasksClassName = [
    "insight-outcome__tasks",
    overflow.above ? "is-clipped-above" : "",
    overflow.below ? "is-clipped-below" : "",
  ]
    .filter(Boolean)
    .join(" ");
  const className = [
    "insight-outcome",
    open && !isEmpty ? "is-open" : "",
    isEmpty ? "is-empty" : "",
  ]
    .filter(Boolean)
    .join(" ");
  return (
    <section className={className}>
      <button
        type="button"
        className="insight-outcome__toggle"
        aria-expanded={isEmpty ? undefined : open}
        aria-controls={isEmpty ? undefined : tasksId}
        aria-label={`${label}, ${group.rows.length} ${
          group.rows.length === 1 ? "Task" : "Tasks"
        }, ${ledgerDuration(group.seconds)}`}
        disabled={isEmpty}
        onClick={() => setOpen((value) => !value)}
      >
        <ChevronRight className="insight-outcome__chevron" aria-hidden="true" />
        <span className="insight-outcome__label">
          <span className="insight-outcome__count">{group.rows.length}</span>{" "}
          {label}
        </span>
        <span
          className={`insight-outcome__total${
            group.seconds > 0 ? "" : " is-none"
          }`}
        >
          {ledgerDuration(group.seconds)}
        </span>
      </button>
      {isEmpty ? null : (
        <ul
          id={tasksId}
          ref={tasksRef}
          className={tasksClassName}
          hidden={!open}
        >
          {group.rows.map((row) => (
            <InsightTaskRow
              key={row.task.id}
              task={row.task}
              seconds={row.seconds}
            />
          ))}
        </ul>
      )}
    </section>
  );
}

function InsightTaskRow({
  task,
  seconds,
}: {
  task: Task;
  seconds: number;
}) {
  return (
    <li
      className="insight-task"
      style={{ "--task-hue": taskHue(task.id) } as CSSProperties}
    >
      <span className="insight-task__swatch" aria-hidden="true" />
      <span className="insight-task__title" title={task.title}>
        {task.title}
      </span>
      <span className={`insight-task__time${seconds > 0 ? "" : " is-none"}`}>
        {ledgerDuration(seconds)}
      </span>
    </li>
  );
}

/** Metric check-ins for the range. The column stays even when the range is
 * quiet. Each Pulse collapses to its average so a long Pulse does not set the
 * board's height. */
export function InsightCheckIns({ groups }: { groups: InsightPulseGroup[] }) {
  return (
    <aside className="insight-pulses" aria-label="Metric check-ins">
      {groups.length === 0 ? (
        <p className="insight-quiet">No Metric check-ins</p>
      ) : (
        groups.map((group) => (
          <InsightPulse key={group.pulseId ?? "none"} group={group} />
        ))
      )}
    </aside>
  );
}

function InsightPulse({ group }: { group: InsightPulseGroup }) {
  const [open, setOpen] = useState(false);
  const metricsId = useId();
  const countLabel = `${group.checkInCount} ${
    group.checkInCount === 1 ? "check-in" : "check-ins"
  }`;
  return (
    <section className={`insight-pulse${open ? " is-open" : ""}`}>
      <button
        type="button"
        className="insight-pulse__toggle"
        aria-expanded={open}
        aria-controls={metricsId}
        aria-label={`${group.name}, ${countLabel}${
          group.average !== null ? `, ${group.average.toFixed(1)}` : ""
        }`}
        onClick={() => setOpen((value) => !value)}
      >
        <NestIcon name={group.icon} />
        <span className="insight-pulse__count">{group.checkInCount}</span>
        <span className="insight-pulse__name">{group.name}</span>
        {group.average !== null ? (
          <span className="insight-pulse__avg">{group.average.toFixed(1)}</span>
        ) : null}
        <ChevronRight className="insight-pulse__chevron" aria-hidden="true" />
      </button>
      <ul id={metricsId} hidden={!open}>
        {group.metrics.map((metric) => (
          <MetricRibbon key={metric.metricId} metric={metric} />
        ))}
      </ul>
    </section>
  );
}

function MetricRibbon({ metric }: { metric: InsightMetricRow }) {
  return (
    <li className="insight-metric">
      <span className="insight-metric__name">
        <NestIcon name={metric.icon} color={metric.color} />
        {metric.name}
      </span>
      <RatingRibbon values={metric.values} />
      <span className="insight-metric__avg">{metric.average.toFixed(1)}</span>
    </li>
  );
}

/** One rating pill per Metric check-in, oldest first. */
function RatingRibbon({ values }: { values: number[] }) {
  return (
    <span
      className="insight-metric__ribbon"
      role="img"
      aria-label={`${values.length} ratings: ${values.join(", ")}`}
    >
      {values.map((value, index) => (
        <span key={index} className={`rating-pill rating-pill--v${value}`}>
          {value}
        </span>
      ))}
    </span>
  );
}
