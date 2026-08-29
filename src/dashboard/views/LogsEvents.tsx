import type { ReactNode } from "react";
import type { Metric, Phase, Pulse, Task } from "../../lib/types";
import { NestIcon } from "../components/PulseIcon";
import { formatTime } from "../lib/time";
import type { RawLogEvent } from "../lib/timeline";
import { BrainDumpEntry } from "../components/logs/BrainDumpEntry";
import { MetricCheckInDetail } from "../components/logs/MetricCheckInDetail";
import { PhaseEventDetail } from "../components/logs/PhaseEventDetail";
import { PlayMarkIcon, StopMarkIcon } from "../components/logs/workMarks";

function taskTitle(tasks: Task[], taskId: number) {
  return tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;
}

function LogsRow({
  kind,
  at,
  children,
}: {
  kind: RawLogEvent["kind"];
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
  event: Extract<RawLogEvent, { kind: "metrics" }>;
  metrics: Metric[];
  pulses: Pulse[];
  onDelete: (id: number) => void;
}) {
  return (
    <LogsRow kind="metrics" at={event.at}>
      <MetricCheckInDetail
        checkIn={event.checkIn}
        metrics={metrics}
        pulses={pulses}
        onDelete={onDelete}
      />
    </LogsRow>
  );
}

function BrainDumpRow({
  event,
  expanded,
  onToggle,
}: {
  event: Extract<RawLogEvent, { kind: "dump" }>;
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
  event: Extract<RawLogEvent, { kind: "phase" }>;
  phases: Phase[];
}) {
  return (
    <LogsRow kind="phase" at={event.at}>
      <PhaseEventDetail
        phaseId={event.checkIn.phaseId}
        phaseLabel={event.checkIn.phaseLabel}
        phases={phases}
      />
    </LogsRow>
  );
}

function WorkRow({
  event,
  tasks,
}: {
  event: Extract<RawLogEvent, { kind: "work-start" | "work-stop" }>;
  tasks: Task[];
}) {
  const started = event.kind === "work-start";
  const label = started ? "Started working" : "Stopped working";
  const title = taskTitle(tasks, event.stretch.taskId);
  return (
    <LogsRow kind={event.kind} at={event.at}>
      <span
        className="event__icon"
        title={`${label} on ${title}`}
        role="img"
        aria-label={`${label} on ${title}`}
      >
        {started ? <PlayMarkIcon /> : <StopMarkIcon />}
      </span>
      <span className="event__work">{title}</span>
    </LogsRow>
  );
}

export function LogsEvents({
  events,
  phases,
  metrics,
  pulses,
  tasks = [],
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  events: RawLogEvent[];
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks?: Task[];
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
          case "work-start":
          case "work-stop":
            return (
              <WorkRow
                key={`${event.kind}-${event.stretch.id}`}
                event={event}
                tasks={tasks}
              />
            );
        }
      })}
    </ol>
  );
}
