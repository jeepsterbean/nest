import { resolveMetricColorFromList } from "../../lib/metricColors";
import type { Metric, Phase, Pulse, Task } from "../../lib/types";
import { NestIcon } from "../components/PulseIcon";
import { phaseIconName, phaseName, phaseTone } from "../lib/period";
import { formatDateTime } from "../lib/time";
import type { RawLogEvent } from "../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";

export const LOG_TYPE_LABEL: Record<RawLogEvent["kind"], string> = {
  metrics: "Metric",
  dump: "Brain dump",
  phase: "Phase",
  "work-start": "Started",
  "work-stop": "Stopped",
};

function taskTitle(tasks: Task[], taskId: number) {
  return tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;
}

function MetricDetail({
  event,
  metrics,
  pulses,
  onDelete,
}: {
  event: Extract<RawLogEvent, { kind: "metrics" }>;
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
    <div className="logs-table__detail logs-table__detail--metrics">
      <span className="event__icon" title={pulseLabel} role="img" aria-label={pulseLabel}>
        <NestIcon name={pulse?.icon ?? "activity"} />
      </span>
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
                  color={
                    metric
                      ? resolveMetricColorFromList(metrics, metric.id)
                      : undefined
                  }
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
    </div>
  );
}

export function LogEventDetail({
  event,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  event: RawLogEvent;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  switch (event.kind) {
    case "metrics":
      return (
        <MetricDetail
          event={event}
          metrics={metrics}
          pulses={pulses}
          onDelete={onDeleteCheckIn}
        />
      );
    case "dump":
      return (
        <div className="logs-table__detail logs-table__detail--dump">
          <BrainDumpEntry
            dump={event.dump}
            expanded={expandedDumpIds.has(event.dump.id)}
            onToggle={() => onToggleDump(event.dump.id)}
          />
        </div>
      );
    case "phase": {
      const name = phaseName(
        event.checkIn.phaseId,
        phases,
        event.checkIn.phaseLabel,
      );
      return (
        <div className="logs-table__detail logs-table__detail--phase">
          <span className="event__icon" title={`${name} phase`} role="img" aria-label={`${name} phase`}>
            <NestIcon name={phaseIconName(name)} />
          </span>
          <span className={`event__phase event__phase--${phaseTone(name)}`}>
            {name}
          </span>
        </div>
      );
    }
    case "work-start":
    case "work-stop":
      return (
        <div className="logs-table__detail logs-table__detail--work">
          {taskTitle(tasks, event.stretch.taskId)}
        </div>
      );
  }
}

export function LogsRawTable({
  events,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  events: RawLogEvent[];
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  return (
    <div className="logs-table-wrap">
      <table className="logs-table">
        <thead>
          <tr>
            <th className="logs-table__col logs-table__col--when">When</th>
            <th className="logs-table__col logs-table__col--type">Type</th>
            <th className="logs-table__col logs-table__col--detail">Detail</th>
          </tr>
        </thead>
        <tbody>
          {events.map((event) => {
            const key =
              event.kind === "metrics"
                ? `metrics-${event.checkIn.id}`
                : event.kind === "dump"
                  ? `dump-${event.dump.id}`
                  : event.kind === "phase"
                    ? `phase-${event.checkIn.id}`
                    : `${event.kind}-${event.stretch.id}`;
            return (
              <tr key={key} className={`logs-table__row logs-table__row--${event.kind}`}>
                <td className="logs-table__col logs-table__col--when">
                  <time dateTime={new Date(event.at * 1000).toISOString()}>
                    {formatDateTime(event.at)}
                  </time>
                </td>
                <td className="logs-table__col logs-table__col--type">
                  {LOG_TYPE_LABEL[event.kind]}
                </td>
                <td className="logs-table__col logs-table__col--detail">
                  <LogEventDetail
                    event={event}
                    phases={phases}
                    metrics={metrics}
                    pulses={pulses}
                    tasks={tasks}
                    expandedDumpIds={expandedDumpIds}
                    onDeleteCheckIn={onDeleteCheckIn}
                    onToggleDump={onToggleDump}
                  />
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}
