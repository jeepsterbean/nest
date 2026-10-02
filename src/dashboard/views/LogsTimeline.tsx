import { memo, useMemo, type CSSProperties } from "react";
import { Download, Plus, Check, X, ArrowRight } from "lucide-react";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import { PhaseTotals } from "../components/DayReflection";
import { NestIcon } from "../components/PulseIcon";
import { isQuietPhase, phaseIcon, phaseName } from "../lib/period";
import { formatTime, shiftDayMs } from "../lib/time";
import {
  groupByDay,
  mergePhaseCheckInsIntoEvents,
  phaseSessionsInWindow,
  type RawLogEvent,
} from "../lib/timeline";
import { LogEventDetail } from "../components/logs/LogEventDetail";
import { PlayMarkIcon, StopMarkIcon } from "../components/logs/workMarks";
import { taskTitle, taskStatusEventLabel } from "../lib/logs";

function timelineMarkLabel(
  event: RawLogEvent,
  phases: Phase[],
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
    case "phase":
      return `${phaseName(event.checkIn.phaseId, phases, event.checkIn.phaseLabel)} phase`;
    case "task-status":
      return `${taskStatusEventLabel(event.statusEvent)} — ${taskTitle(tasks, event.statusEvent.taskId)}`;
    case "work-start":
      return `Started working on ${taskTitle(tasks, event.stretch.taskId)}`;
    case "work-stop":
      return `Stopped working on ${taskTitle(tasks, event.stretch.taskId)}`;
  }
}

function TimelineMark({
  event,
  phases,
  pulses,
  tasks,
}: {
  event: RawLogEvent;
  phases: Phase[];
  pulses: Pulse[];
  tasks: Task[];
}) {
  const label = timelineMarkLabel(event, phases, pulses, tasks);
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
      ) : event.kind === "task-status" ? (
        event.statusEvent.fromStatus === null ? <Plus />
          : event.statusEvent.toStatus === "completed" ? <Check />
          : event.statusEvent.toStatus === "cancelled" ? <X />
          : <ArrowRight />
      ) : event.kind === "work-start" ? (
        <PlayMarkIcon />
      ) : (
        <StopMarkIcon />
      )}
    </span>
  );
}

const eventKey = (event: RawLogEvent) =>
  event.kind === "metrics"
    ? `metrics-${event.checkIn.id}`
    : event.kind === "dump"
      ? `dump-${event.dump.id}`
      : event.kind === "phase"
        ? `phase-${event.checkIn.id}`
        : event.kind === "task-status"
          ? `task-status-${event.statusEvent.id}`
          : `${event.kind}-${event.stretch.id}`;

function DayExportButton({
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
  showPhaseTotals = true,
  colorsTimeColumn = true,
}: {
  events: RawLogEvent[];
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
  /** Overview shows the day's Phase totals. Logs does not. */
  showPhaseTotals?: boolean;
  /** Logs with Phases filtered out keeps the quiet time column. */
  colorsTimeColumn?: boolean;
}) {
  const days = useMemo(
    () =>
      groupByDay(
        mergePhaseCheckInsIntoEvents(
          events,
          colorsTimeColumn ? phaseCheckIns : [],
        ),
        nowMs,
      ),
    [colorsTimeColumn, events, nowMs, phaseCheckIns],
  );
  const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
  const now = Math.floor(nowMs / 1000);

  return days.map((day) => {
    const daySessions =
      dayChrome && showPhaseTotals
        ? phaseSessionsInWindow(
            phaseCheckIns,
            day.key / 1000,
            Math.min(shiftDayMs(day.key, 1) / 1000, now),
            isQuiet,
            false,
          )
        : [];

    return (
      <article key={day.key} className="day-group logs-chrono-day">
        {dayChrome ? (
          <header className="day-group__head">
            <h3 className="day-group__label">{day.label}</h3>
            <div className="day-group__meta">
              {showPhaseTotals ? (
                <PhaseTotals sessions={daySessions} phases={phases} />
              ) : null}
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

            return (
              <li
                key={eventKey(event)}
                className={`logs-chrono__row logs-chrono__row--${event.kind}${
                  phase?.color ? " logs-chrono__row--colored" : ""
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
                    phases={phases}
                    pulses={pulses}
                    tasks={tasks}
                  />
                  <LogEventDetail
                    event={event}
                    phases={phases}
                    metrics={metrics}
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
