import { useMemo } from "react";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import { NestIcon } from "../components/PulseIcon";
import { phaseIconName, phaseName, phaseTone } from "../lib/period";
import { formatTime } from "../lib/time";
import {
  groupByDay,
  mergePhaseCheckInsIntoEvents,
  type TimelineLogEvent,
} from "../lib/timeline";
import { LOG_TYPE_LABEL, LogEventDetail } from "./LogsRawTable";

const eventKey = (event: TimelineLogEvent) =>
  event.kind === "metrics"
    ? `metrics-${event.checkIn.id}`
    : event.kind === "dump"
      ? `dump-${event.dump.id}`
      : `${event.kind}-${event.stretch.id}`;

export function LogsTimeline({
  events,
  phaseCheckIns,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  events: TimelineLogEvent[];
  phaseCheckIns: PhaseCheckIn[];
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  const days = useMemo(
    () => groupByDay(mergePhaseCheckInsIntoEvents(events, phaseCheckIns)),
    [events, phaseCheckIns],
  );

  return days.map((day) => (
    <article key={day.key} className="day-group logs-chrono-day">
      <header className="day-group__head">
        <h3 className="day-group__label">{day.label}</h3>
      </header>
      <ol className="logs-chrono">
        {day.events.map((row, index) => {
          const { event, phaseCheckIn: checkpoint } = row;
          const name = phaseName(
            checkpoint?.phaseId ?? null,
            phases,
            checkpoint?.phaseLabel,
          );
          const previousCheckpoint = day.events[index - 1]?.phaseCheckIn;
          const showPhase =
            index === 0 || previousCheckpoint?.phaseId !== checkpoint?.phaseId;

          return (
            <li key={eventKey(event)} className={`logs-chrono__row logs-chrono__row--${event.kind}`}>
              <div
                className={`logs-chrono__phase logs-chrono__phase--${phaseTone(name)}`}
                title={`${name} phase`}
                aria-label={`${name} phase`}
              >
                {showPhase ? (
                  <>
                    <NestIcon name={phaseIconName(name)} />
                    <span>{name}</span>
                  </>
                ) : null}
              </div>
              <div className="logs-chrono__event">
                <time dateTime={new Date(event.at * 1000).toISOString()}>
                  {formatTime(event.at)}
                </time>
                <span className="logs-chrono__mark" aria-hidden="true" />
                <span className="logs-chrono__type">{LOG_TYPE_LABEL[event.kind]}</span>
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
              </div>
            </li>
          );
        })}
      </ol>
    </article>
  ));
}
