import { memo, useMemo, type CSSProperties } from "react";
import { Download } from "lucide-react";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import { dayLabel, formatTime, startOfDayMs } from "../lib/time";
import {
  groupByDay,
  mergePhaseCheckInsIntoEvents,
  phaseCheckInAt,
  type RawLogEvent,
} from "../lib/timeline";
import { LogEventDetail } from "../components/logs/LogEventDetail";
import { LogEventIcon, logEventLabel } from "../components/logs/LogEventMark";

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
  const label = logEventLabel(event, phases, pulses, tasks);
  return (
    <span
      className="logs-chrono__mark"
      title={label}
      role="img"
      aria-label={label}
    >
      <LogEventIcon event={event} phases={phases} pulses={pulses} />
    </span>
  );
}

/** Today's clock, above that day's marks. The event cell stays empty. */
function CurrentTimeRow({
  nowMs,
  phase,
}: {
  nowMs: number;
  phase: Phase | undefined;
}) {
  return (
    <li
      className={`logs-chrono__row logs-chrono__row--now${
        phase?.color ? " logs-chrono__row--colored" : ""
      }`}
      style={
        phase?.color
          ? ({ "--phase-color": phase.color } as CSSProperties)
          : undefined
      }
    >
      <div className="logs-chrono__when">
        <time dateTime={new Date(nowMs).toISOString()}>
          {formatTime(Math.floor(nowMs / 1000))}
        </time>
      </div>
      <div className="logs-chrono__event">
        <span className="logs-chrono__now" aria-hidden="true" />
      </div>
    </li>
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
  onOpenDay,
  nowMs,
  showCurrentTime = true,
  dayChrome = true,
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
  /** Timeline turns each day label into a jump to that day on Calendar's Logs figure. */
  onOpenDay?: (dayKey: number) => void;
  nowMs: number;
  /** Overview's minimised peek hides the day label. */
  dayChrome?: boolean;
  showCurrentTime?: boolean;
  /** Timeline with Phases filtered out keeps the quiet time column. */
  colorsTimeColumn?: boolean;
}) {
  const days = useMemo(() => {
    const groups = groupByDay(
      mergePhaseCheckInsIntoEvents(events, colorsTimeColumn ? phaseCheckIns : []),
      nowMs,
    );
    const today = startOfDayMs(nowMs / 1000);
    if (showCurrentTime && !groups.some((day) => day.key === today)) {
      groups.unshift({ key: today, label: dayLabel(today / 1000, nowMs), events: [] });
    }
    return groups;
  }, [colorsTimeColumn, events, nowMs, phaseCheckIns, showCurrentTime]);
  const now = Math.floor(nowMs / 1000);
  const todayKey = startOfDayMs(now);
  const nowPhase = colorsTimeColumn
    ? phases.find(
        (item) => item.id === phaseCheckInAt(phaseCheckIns, now)?.phaseId,
      )
    : undefined;

  return days.map((day) => (
      <article
        key={day.key}
        className="day-group logs-chrono-day"
      >
        {dayChrome ? (
          <header className="day-group__head">
            <h3 className="day-group__label">
              {onOpenDay ? (
                <button
                  type="button"
                  className="day-group__open"
                  title="Open in Logs"
                  onClick={() => onOpenDay(day.key)}
                >
                  {day.label}
                </button>
              ) : (
                day.label
              )}
            </h3>
            {onExportDay ? (
              <div className="day-group__meta">
                <DayExportButton
                  label={day.label}
                  dayKey={day.key}
                  onExportDay={onExportDay}
                />
              </div>
            ) : null}
          </header>
        ) : null}
        <ol className="logs-chrono">
          {showCurrentTime && day.key === todayKey ? (
            <CurrentTimeRow nowMs={nowMs} phase={nowPhase} />
          ) : null}
          {day.events.map((row, index) => {
            const { event, phaseCheckIn: checkpoint } = row;
            const phase = phases.find((item) => item.id === checkpoint?.phaseId);
            const followsNow = showCurrentTime && day.key === todayKey && index === 0;

            return (
              <li
                key={eventKey(event)}
                className={`logs-chrono__row logs-chrono__row--${event.kind}${
                  phase?.color ? " logs-chrono__row--colored" : ""
                }${followsNow ? " logs-chrono__row--after-now" : ""}`}
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
  ));
});
