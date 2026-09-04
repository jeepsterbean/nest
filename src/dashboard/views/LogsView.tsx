import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import {
  collapsePhaseCheckIns,
  buildRawLog,
  buildTimeline,
  groupByDay,
  phaseCheckInsInRange,
  type DayGroup,
  type RawLogEvent,
  type TimelineEvent,
} from "../lib/timeline";
import {
  buildLogExportEvents,
  downloadLogDay,
  LOG_EVENT_BATCH_SIZE,
  LOG_VIEWS,
  readLogsPreferences,
  writeLogsPreferences,
  type LogsPreferences,
  type LogsViewKey,
} from "../lib/logs";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { historyStartSec } from "../lib/time";
import { ViewToggle } from "../components/ViewToggle";
import { LogsEvents } from "./LogsEvents";
import { DayExportButton, LogsTimeline } from "./LogsTimeline";

const EMPTY_COPY: Record<LogsViewKey, { title: string; body: string }> = {
  raw: {
    title: "Nothing here yet",
    body: "Metric check-ins, brain dumps, Phase changes, and Working now starts and stops will land here.",
  },
  timeline: {
    title: "Nothing on the timeline yet",
    body: "Metric check-ins, brain dumps, and Working now starts and stops will land here.",
  },
  dumps: {
    title: "No brain dumps yet",
    body: "Capture a thought from Overview or the popup.",
  },
  phases: {
    title: "No Phase changes yet",
    body: "Phase checkpoints appear here as attention shifts.",
  },
  metrics: {
    title: "No Metric check-ins yet",
    body: "Press ⌘⇧E anywhere to log your first Metric check-in.",
  },
};

function DayArticle({
  day,
  phases,
  metrics,
  pulses,
  tasks,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
  onExportDay,
}: {
  day: DayGroup<RawLogEvent>;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
  onExportDay: (dayKey: number) => void;
}) {
  return (
    <article className="day-group">
      <header className="day-group__head">
        <h3 className="day-group__label">{day.label}</h3>
        <DayExportButton
          label={day.label}
          dayKey={day.key}
          onExportDay={onExportDay}
        />
      </header>
      <LogsEvents
        events={day.events}
        phases={phases}
        metrics={metrics}
        pulses={pulses}
        tasks={tasks}
        expandedDumpIds={expandedDumpIds}
        onDeleteCheckIn={onDeleteCheckIn}
        onToggleDump={onToggleDump}
      />
    </article>
  );
}

function phaseEvents(checkIns: PhaseCheckIn[]): TimelineEvent[] {
  return buildTimeline([], checkIns, []);
}

function filteredEvents(
  view: Exclude<LogsViewKey, "raw" | "timeline">,
  checkIns: Parameters<typeof buildTimeline>[0],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: Parameters<typeof buildTimeline>[2],
  historyFromSec: number,
): TimelineEvent[] {
  switch (view) {
    case "dumps":
      return buildTimeline([], [], brainDumps);
    case "metrics":
      return buildTimeline(checkIns, [], []);
    case "phases": {
      // Always aggregate: collapse with the carry-in still present so a settle
      // that matches the Phase already active at the window start is omitted;
      // then drop the carry-in from the event list.
      return phaseEvents(
        phaseCheckInsInRange(
          collapsePhaseCheckIns(phaseCheckIns),
          historyFromSec,
        ),
      );
    }
  }
}

export function LogsView() {
  const {
    metrics,
    pulses,
    phases,
    tasks,
    checkIns,
    phaseCheckIns,
    brainDumps,
    taskWorkStretches,
    loaded,
    mutate,
  } = useDashboardData();
  const [preferences, setPreferences] = useState(readLogsPreferences);
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );
  const { view } = preferences;
  const nowMs = useCurrentTime();
  const historyFromSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const eventPhaseCheckIns = useMemo(
    () => phaseCheckInsInRange(phaseCheckIns, historyFromSec),
    [historyFromSec, phaseCheckIns],
  );

  const rawEvents = useMemo(
    () =>
      buildRawLog(checkIns, eventPhaseCheckIns, brainDumps, taskWorkStretches),
    [checkIns, eventPhaseCheckIns, brainDumps, taskWorkStretches],
  );

  const timelineEvents = useMemo(
    () => rawEvents.filter((event) => event.kind !== "phase"),
    [rawEvents],
  );

  const exportEventsByDay = useMemo(
    () =>
      new Map(
        groupByDay(
          buildLogExportEvents(
            checkIns,
            phaseCheckIns,
            brainDumps,
            taskWorkStretches,
            historyFromSec,
          ),
          nowMs,
        ).map((day) => [day.key, day.events]),
      ),
    [
      brainDumps,
      checkIns,
      historyFromSec,
      nowMs,
      phaseCheckIns,
      taskWorkStretches,
    ],
  );

  const listEvents = useMemo((): RawLogEvent[] => {
    if (view === "timeline") return [];
    if (view === "raw") return rawEvents;
    return filteredEvents(
      view,
      checkIns,
      phaseCheckIns,
      brainDumps,
      historyFromSec,
    );
  }, [
    view,
    rawEvents,
    checkIns,
    phaseCheckIns,
    brainDumps,
    historyFromSec,
  ]);

  const visibleTimelineEvents = useMemo(
    () => timelineEvents.slice(0, visibleEventCount),
    [timelineEvents, visibleEventCount],
  );
  const visibleListEvents = useMemo(
    () => listEvents.slice(0, visibleEventCount),
    [listEvents, visibleEventCount],
  );
  const days = useMemo(
    () => groupByDay(visibleListEvents, nowMs),
    [nowMs, visibleListEvents],
  );

  const updatePreferences = (changes: Partial<LogsPreferences>) => {
    const next = { ...preferences, ...changes };
    writeLogsPreferences(next);
    setPreferences(next);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
  };

  const onDeleteCheckIn = (id: number) =>
    void mutate(() => deleteMetricCheckIn(id));

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const exportDay = (dayKey: number) =>
    downloadLogDay(dayKey, exportEventsByDay.get(dayKey) ?? [], {
      phases,
      metrics,
      pulses,
      tasks,
    });

  const empty = EMPTY_COPY[view];
  const eventCount =
    view === "timeline" ? timelineEvents.length : listEvents.length;
  const remainingEventCount = Math.max(0, eventCount - visibleEventCount);
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);

  return (
    <section className="dash-section dash-section--logs">
      <div className="dash-toolbar">
        <ViewToggle
          value={view}
          options={LOG_VIEWS}
          label="Logs view"
          onChange={(nextView) => updatePreferences({ view: nextView })}
        />
      </div>
      <div className="dash-section__body">
        {!loaded ? null : eventCount === 0 ? (
          <div className="dash-empty">
            <strong>{empty.title}</strong>
            <span>{empty.body}</span>
          </div>
        ) : view === "timeline" ? (
          <LogsTimeline
            events={visibleTimelineEvents}
            phaseCheckIns={phaseCheckIns}
            phases={phases}
            metrics={metrics}
            pulses={pulses}
            tasks={tasks}
            expandedDumpIds={expandedDumpIds}
            onDeleteCheckIn={onDeleteCheckIn}
            onToggleDump={toggleDumpExpanded}
            onExportDay={exportDay}
            nowMs={nowMs}
          />
        ) : (
          days.map((day) => (
            <DayArticle
              key={day.key}
              day={day}
              phases={phases}
              metrics={metrics}
              pulses={pulses}
              tasks={tasks}
              expandedDumpIds={expandedDumpIds}
              onDeleteCheckIn={onDeleteCheckIn}
              onToggleDump={toggleDumpExpanded}
              onExportDay={exportDay}
            />
          ))
        )}
        {loaded && remainingEventCount > 0 ? (
          <div className="logs-load-older">
            <button
              type="button"
              className="btn-accent"
              onClick={() =>
                setVisibleEventCount((count) => count + LOG_EVENT_BATCH_SIZE)
              }
            >
              Load {nextBatchSize} older
            </button>
            <span>
              Showing {Math.min(visibleEventCount, eventCount)} of {eventCount}
            </span>
          </div>
        ) : null}
      </div>
    </section>
  );
}
