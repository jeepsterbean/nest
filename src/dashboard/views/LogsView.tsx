import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Metric, Phase, PhaseCheckIn, Pulse, Task } from "../../lib/types";
import {
  buildRawLog,
  buildTimeline,
  collapsePhaseCheckIns,
  groupByDay,
  phaseCheckInsInRange,
  type DayGroup,
  type RawLogEvent,
} from "../lib/timeline";
import {
  buildLogExportEvents,
  buildTimelineLogEvents,
  downloadLogDay,
  LOG_EVENT_BATCH_SIZE,
  LOG_VIEWS,
  readLogsPreferences,
  TIMELINE_LAYOUTS,
  writeLogsPreferences,
  type LogsPreferences,
  type LogsViewKey,
  type TimelineLayoutKey,
} from "../lib/logs";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon } from "../lib/tileIcons";
import { historyStartSec } from "../lib/time";
import { IconPickerButton } from "../components/PulseIcon";
import { ViewToggle } from "../components/ViewToggle";
import { LogsEvents } from "./LogsEvents";
import { DayExportButton, LogsTimeline } from "./LogsTimeline";

type EmptyCopyKey = Exclude<LogsViewKey, "timeline"> | TimelineLayoutKey;

const EMPTY_COPY: Record<EmptyCopyKey, { title: string; body: string }> = {
  raw: {
    title: "Nothing here yet",
    body: "Metric check-ins, brain dumps, Phase changes, and Working now starts and stops will land here.",
  },
  rail: {
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

function filteredEvents(
  view: Exclude<LogsViewKey, "timeline">,
  checkIns: Parameters<typeof buildTimeline>[0],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: Parameters<typeof buildTimeline>[2],
  historyFromSec: number,
): RawLogEvent[] {
  switch (view) {
    case "dumps":
      return buildTimeline([], [], brainDumps);
    case "metrics":
      return buildTimeline(checkIns, [], []);
    case "phases":
      // Collapse with the carry-in still present so a settle that matches the
      // Phase already active at the window start is omitted; then drop the
      // carry-in from the event list.
      return buildTimeline(
        [],
        phaseCheckInsInRange(
          collapsePhaseCheckIns(phaseCheckIns),
          historyFromSec,
        ),
        [],
      );
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
  const icons = useTileIcons();
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );
  const { view, timelineLayout } = preferences;
  const isRailTimeline = view === "timeline" && timelineLayout === "rail";
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
    () => buildTimelineLogEvents(checkIns, brainDumps, taskWorkStretches),
    [brainDumps, checkIns, taskWorkStretches],
  );

  const exportEvents = useMemo(
    () =>
      buildLogExportEvents(
        checkIns,
        phaseCheckIns,
        brainDumps,
        taskWorkStretches,
        historyFromSec,
      ),
    [
      brainDumps,
      checkIns,
      historyFromSec,
      phaseCheckIns,
      taskWorkStretches,
    ],
  );

  const exportEventsByDay = useMemo(
    () =>
      new Map(
        groupByDay(exportEvents, nowMs).map((day) => [day.key, day.events]),
      ),
    [nowMs, exportEvents],
  );

  const listEvents = useMemo((): RawLogEvent[] => {
    if (view !== "timeline") {
      return filteredEvents(
        view,
        checkIns,
        phaseCheckIns,
        brainDumps,
        historyFromSec,
      );
    }
    return timelineLayout === "raw" ? rawEvents : [];
  }, [
    view,
    timelineLayout,
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

  const empty = EMPTY_COPY[view === "timeline" ? timelineLayout : view];
  const eventCount = isRailTimeline ? timelineEvents.length : listEvents.length;
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
        {view === "timeline" ? (
          <ViewToggle
            value={timelineLayout}
            options={TIMELINE_LAYOUTS}
            label="Timeline layout"
            onChange={(nextLayout) =>
              updatePreferences({ timelineLayout: nextLayout })
            }
          />
        ) : null}
        {/* Logs shares the Overview Timeline tile's icon slot. */}
        <IconPickerButton
          className="dash-section__tile-icon"
          icon={icons.timeline}
          label="Logs"
          onChange={(nextIcon) => writeTileIcon("timeline", nextIcon)}
        />
      </div>
      <div className="dash-section__body">
        {!loaded ? null : eventCount === 0 ? (
          <div className="dash-empty">
            <strong>{empty.title}</strong>
            <span>{empty.body}</span>
          </div>
        ) : isRailTimeline ? (
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
