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
import { LogEventDetail } from "../components/logs/LogEventDetail";

function taskTitle(tasks: Task[], taskId: number) {
  return tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;
}

function PlayMarkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function StopMarkIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="6" y="6" width="8" height="8" rx="1" fill="currentColor" stroke="none" />
    </svg>
  );
}

function timelineMarkLabel(
  event: TimelineLogEvent,
  pulses: Pulse[],
  tasks: Task[],
) {
  switch (event.kind) {
    case "metrics": {
      const pulse =
        event.checkIn.pulseId === null
          ? undefined
          : pulses.find((item) => item.id === event.checkIn.pulseId);
      return pulse?.name ?? event.checkIn.pulseName ?? "Metric check-in";
    }
    case "dump":
      return "Brain dump";
    case "work-start":
      return `Started working on ${taskTitle(tasks, event.stretch.taskId)}`;
    case "work-stop":
      return `Stopped working on ${taskTitle(tasks, event.stretch.taskId)}`;
  }
}

function TimelineMark({
  event,
  pulses,
  tasks,
}: {
  event: TimelineLogEvent;
  pulses: Pulse[];
  tasks: Task[];
}) {
  const label = timelineMarkLabel(event, pulses, tasks);
  const pulse =
    event.kind === "metrics" && event.checkIn.pulseId !== null
      ? pulses.find((item) => item.id === event.checkIn.pulseId)
      : undefined;

  const isWork = event.kind === "work-start" || event.kind === "work-stop";

  return (
    <span
      className={`logs-chrono__mark${isWork ? " logs-chrono__mark--badge" : ""}`}
      title={label}
      role="img"
      aria-label={label}
    >
      {event.kind === "metrics" ? (
        <NestIcon name={pulse?.icon ?? "activity"} />
      ) : event.kind === "dump" ? (
        <NestIcon name="notes" />
      ) : event.kind === "work-start" ? (
        <PlayMarkIcon />
      ) : (
        <StopMarkIcon />
      )}
    </span>
  );
}

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
                <TimelineMark event={event} pulses={pulses} tasks={tasks} />
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
