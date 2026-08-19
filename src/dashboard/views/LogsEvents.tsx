import type { ReactNode } from "react";
import { resolveMetricColorFromList } from "../../lib/metricColors";
import type { Metric, Phase, Pulse } from "../../lib/types";
import { NestIcon } from "../components/PulseIcon";
import { phaseIconName, phaseName, phaseTone } from "../lib/period";
import { formatTime } from "../lib/time";
import type { TimelineEvent } from "../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";

function LogsRow({
  kind,
  at,
  children,
}: {
  kind: TimelineEvent["kind"];
  at: number;
  children: ReactNode;
}) {
  return (
    <li className={`event event--${kind}`}>
      <time className="event__time" dateTime={new Date(at * 1000).toISOString()}>
        {formatTime(at)}
      </time>
      <span className="event__mark" aria-hidden="true" />
      <div className="event__body">{children}</div>
    </li>
  );
}

function EventIcon({ name, label }: { name: string; label: string }) {
  return (
    <span className="event__icon" title={label} role="img" aria-label={label}>
      <NestIcon name={name} />
    </span>
  );
}

function MetricCheckInRow({
  event,
  metrics,
  pulses,
  onDelete,
}: {
  event: Extract<TimelineEvent, { kind: "metrics" }>;
  metrics: Metric[];
  pulses: Pulse[];
  onDelete: (id: number) => void;
}) {
  const pulse =
    event.checkIn.pulseId === null
      ? undefined
      : pulses.find((item) => item.id === event.checkIn.pulseId);
  const pulseLabel = pulse?.name ?? event.checkIn.pulseName ?? "Metric check-in";

  return (
    <LogsRow kind="metrics" at={event.at}>
      <EventIcon name={pulse?.icon ?? "activity"} label={pulseLabel} />
      <ul className="event__ratings">
        {event.checkIn.ratings.map((rating) => {
          const metric = metrics.find((item) => item.id === rating.metricId);
          const metricLabel = metric?.name ?? `Metric ${rating.metricId}`;
          return (
            <li key={rating.metricId} className="event__rating">
              <span
                className="event__rating-icon"
                title={metricLabel}
                role="img"
                aria-label={metricLabel}
              >
                <NestIcon
                  name={metric?.icon ?? "activity"}
                  color={metric ? resolveMetricColorFromList(metrics, metric.id) : undefined}
                />
              </span>
              <span className={`rating-pill rating-pill--v${rating.value}`}>
                {rating.value}
              </span>
            </li>
          );
        })}
      </ul>
      <button
        type="button"
        className="event__delete"
        onClick={() => onDelete(event.checkIn.id)}
        aria-label="Delete metric check-in"
        title="Delete metric check-in"
      >
        ×
      </button>
    </LogsRow>
  );
}

function BrainDumpRow({
  event,
  expanded,
  onToggle,
}: {
  event: Extract<TimelineEvent, { kind: "dump" }>;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <LogsRow kind="dump" at={event.at}>
      <EventIcon name="notes" label="Brain dump" />
      <BrainDumpEntry
        dump={event.dump}
        expanded={expanded}
        onToggle={onToggle}
      />
    </LogsRow>
  );
}

function PhaseRow({
  event,
  phases,
}: {
  event: Extract<TimelineEvent, { kind: "phase" }>;
  phases: Phase[];
}) {
  const name = phaseName(
    event.checkIn.phaseId,
    phases,
    event.checkIn.phaseLabel,
  );
  return (
    <LogsRow kind="phase" at={event.at}>
      <EventIcon name={phaseIconName(name)} label={`${name} phase`} />
      <span className={`event__phase event__phase--${phaseTone(name)}`}>
        {name}
      </span>
    </LogsRow>
  );
}

export function LogsEvents({
  events,
  phases,
  metrics,
  pulses,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  events: TimelineEvent[];
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  return (
    <ol className="timeline">
      {events.map((event) => {
        switch (event.kind) {
          case "metrics":
            return (
              <MetricCheckInRow
                key={`metrics-${event.checkIn.id}`}
                event={event}
                metrics={metrics}
                pulses={pulses}
                onDelete={onDeleteCheckIn}
              />
            );
          case "dump":
            return (
              <BrainDumpRow
                key={`dump-${event.dump.id}`}
                event={event}
                expanded={expandedDumpIds.has(event.dump.id)}
                onToggle={() => onToggleDump(event.dump.id)}
              />
            );
          case "phase":
            return (
              <PhaseRow
                key={`phase-${event.checkIn.id}`}
                event={event}
                phases={phases}
              />
            );
        }
      })}
    </ol>
  );
}
