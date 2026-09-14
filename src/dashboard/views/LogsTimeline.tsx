import { memo, useMemo, type CSSProperties } from "react";
import { Download } from "lucide-react";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import { PhaseTotals } from "../components/DayReflection";
import { NestIcon } from "../components/PulseIcon";
import { isQuietPhase, phaseIcon, phaseName } from "../lib/period";
import { formatTime, shiftDayMs } from "../lib/time";
import {
  groupByDay,
  mergePhaseCheckInsIntoEvents,
  phaseSessionsInWindow,
  type TimelineLogEvent,
} from "../lib/timeline";
import { LogEventDetail } from "../components/logs/LogEventDetail";
import { PlayMarkIcon, StopMarkIcon } from "../components/logs/workMarks";

function taskTitle(tasks: Task[], taskId: number) {
  return tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;
}

function timelineMarkLabel(
  event: TimelineLogEvent,
  pulses: Pulse[],
  tasks: Task[],
  phases: Phase[],
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
    case "phase":
      return `${phaseName(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)} phase`;
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
  phases,
}: {
  event: TimelineLogEvent;
  pulses: Pulse[];
  tasks: Task[];
  phases: Phase[];
}) {
  const label = timelineMarkLabel(event, pulses, tasks, phases);
  const pulse =
    event.kind === "metrics" && event.checkIn.pulseId !== null
      ? pulses.find((item) => item.id === event.checkIn.pulseId)
      : undefined;

  return (
    <span
      className="logs-chrono__mark"
      title={label}
      role="img"
      aria-label={label}
    >
      {event.kind === "metrics" ? (
        <NestIcon name={pulse?.icon ?? "activity"} />
      ) : event.kind === "dump" ? (
        <NestIcon name="notes" />
      ) : event.kind === "phase" ? (
        <NestIcon
          name={phaseIcon(
            event.checkIn.phaseId,
            phases,
            event.checkIn.phaseLabel,
          )}
        />
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
      : event.kind === "phase"
        ? `phase-${event.checkIn.id}`
        : `${event.kind}-${event.stretch.id}`;

export function DayExportButton({
  label,
  dayKey,
  onExportDay,
}: {
  label: string;
  dayKey: number;
  onExportDay: (dayKey: number) => void;
}) {
  return (
    <button
      type="button"
      className="day-group__export"
      onClick={() => onExportDay(dayKey)}
      aria-label={`Export ${label} timeline as Markdown`}
      title="Export timeline as Markdown"
    >
      <Download aria-hidden="true" />
    </button>
  );
}

/** Memoized: the Overview brain dump composer re-renders on every keystroke,
 * and rebuilding up to LOG_EVENT_BATCH_SIZE rows underneath it is what made
 * typing lag. Callers must pass stable handler identities for this to hold. */
export const LogsTimeline = memo(function LogsTimeline({
  events,
  phaseCheckIns,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
  onExportDay,
  nowMs,
  dayChrome = true,
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
  onExportDay?: (dayKey: number) => void;
  nowMs: number;
  /** Overview's minimised peek hides the day label and Phase totals. */
  dayChrome?: boolean;
}) {
  const days = useMemo(
    () =>
      groupByDay(mergePhaseCheckInsIntoEvents(events, phaseCheckIns), nowMs),
    [events, nowMs, phaseCheckIns],
  );
  const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
  const now = Math.floor(nowMs / 1000);

  return days.map((day) => {
    const daySessions = dayChrome
      ? phaseSessionsInWindow(
          phaseCheckIns,
          day.key / 1000,
          Math.min(shiftDayMs(day.key, 1) / 1000, now),
          isQuiet,
          false,
        )
      : [];
    // Rows between a work-start and its matching work-stop light up the rail as one stretch.
    const openStretchIds = new Set<number>();

    return (
      <article key={day.key} className="day-group logs-chrono-day">
        {dayChrome ? (
          <header className="day-group__head">
            <h3 className="day-group__label">{day.label}</h3>
            <div className="day-group__meta">
              <PhaseTotals sessions={daySessions} phases={phases} />
              {onExportDay ? (
                <DayExportButton
                  label={day.label}
                  dayKey={day.key}
                  onExportDay={onExportDay}
                />
              ) : null}
            </div>
          </header>
        ) : null}
        <ol className="logs-chrono">
          {day.events.map((row) => {
            const { event, phaseCheckIn: checkpoint } = row;
            const phase = phases.find((item) => item.id === checkpoint?.phaseId);

            const wasStretchOpen = openStretchIds.size > 0;
            if (event.kind === "work-start") openStretchIds.add(event.stretch.id);
            const isStretchOpen = openStretchIds.size > 0;
            if (event.kind === "work-stop") openStretchIds.delete(event.stretch.id);
            const inStretch = wasStretchOpen || isStretchOpen;

            return (
              <li
                key={eventKey(event)}
                className={`logs-chrono__row logs-chrono__row--${event.kind}${
                  phase?.color ? " logs-chrono__row--colored" : ""
                }${
                  inStretch ? " logs-chrono__row--in-stretch" : ""
                }`}
                style={
                  phase?.color
                    ? ({ "--phase-color": phase.color } as CSSProperties)
                    : undefined
                }
              >
                <div className="logs-chrono__when">
                  <time dateTime={new Date(event.at * 1000).toISOString()}>
                    {formatTime(event.at)}
                  </time>
                </div>
                <div className="logs-chrono__event">
                  <TimelineMark
                    event={event}
                    pulses={pulses}
                    tasks={tasks}
                    phases={phases}
                  />
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
    );
  });
});
