import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Metric, Phase, PhaseCheckIn, Pulse } from "../../lib/types";
import {
  collapsePhaseCheckIns,
  buildRawLog,
  buildTimeline,
  groupByDay,
  type DayGroup,
  type TimelineEvent,
} from "../lib/timeline";
import {
  LOG_EVENT_BATCH_SIZE,
  LOG_LAYOUTS,
  PHASE_LOG_MODES,
  RAW_LOG_FILTERS,
  readLogsPreferences,
  writeLogsPreferences,
  type LogsPreferences,
  type PhaseLogModeKey,
  type RawLogFilterKey,
} from "../lib/logs";
import { useDashboardData } from "../context/DashboardDataContext";
import { ViewToggle } from "../components/ViewToggle";
import { LogsEvents } from "./LogsEvents";
import { LogsRawTable } from "./LogsRawTable";
import { LogsTimeline } from "./LogsTimeline";

const EMPTY_COPY: Record<
  RawLogFilterKey | "timeline",
  { title: string; body: string }
> = {
  all: {
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
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
}: {
  day: DayGroup;
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
}) {
  return (
    <article className="day-group">
      <header className="day-group__head">
        <h3 className="day-group__label">{day.label}</h3>
      </header>
      <LogsEvents
        events={day.events}
        phases={phases}
        metrics={metrics}
        pulses={pulses}
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
  view: Exclude<RawLogFilterKey, "all">,
  phaseMode: PhaseLogModeKey,
  checkIns: Parameters<typeof buildTimeline>[0],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: Parameters<typeof buildTimeline>[2],
): TimelineEvent[] {
  switch (view) {
    case "dumps":
      return buildTimeline([], [], brainDumps);
    case "metrics":
      return buildTimeline(checkIns, [], []);
    case "phases":
      return phaseEvents(
        phaseMode === "aggregated"
          ? collapsePhaseCheckIns(phaseCheckIns)
          : phaseCheckIns,
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
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );
  const { layout: logsLayout, rawFilter, phaseMode } = preferences;

  const rawEvents = useMemo(
    () => buildRawLog(checkIns, phaseCheckIns, brainDumps, taskWorkStretches),
    [checkIns, phaseCheckIns, brainDumps, taskWorkStretches],
  );

  const timelineEvents = useMemo(
    () => rawEvents.filter((event) => event.kind !== "phase"),
    [rawEvents],
  );

  const filteredRawEvents = useMemo(
    () =>
      rawFilter === "all"
        ? []
        : filteredEvents(
            rawFilter,
            phaseMode,
            checkIns,
            phaseCheckIns,
            brainDumps,
          ),
    [rawFilter, phaseMode, checkIns, phaseCheckIns, brainDumps],
  );

  const visibleRawEvents = useMemo(
    () => rawEvents.slice(0, visibleEventCount),
    [rawEvents, visibleEventCount],
  );
  const visibleTimelineEvents = useMemo(
    () => timelineEvents.slice(0, visibleEventCount),
    [timelineEvents, visibleEventCount],
  );
  const visibleFilteredEvents = useMemo(
    () => filteredRawEvents.slice(0, visibleEventCount),
    [filteredRawEvents, visibleEventCount],
  );
  const days = useMemo(
    () => groupByDay(visibleFilteredEvents),
    [visibleFilteredEvents],
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

  const empty = EMPTY_COPY[logsLayout === "timeline" ? "timeline" : rawFilter];
  const eventCount =
    logsLayout === "timeline"
      ? timelineEvents.length
      : rawFilter === "all"
        ? rawEvents.length
        : filteredRawEvents.length;
  const remainingEventCount = Math.max(0, eventCount - visibleEventCount);
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);

  return (
    <section className="dash-section dash-section--logs">
      <div className="dash-toolbar">
        <ViewToggle
          value={logsLayout}
          options={LOG_LAYOUTS}
          label="Logs layout"
          onChange={(layout) => updatePreferences({ layout })}
        />
      </div>
      <div className="dash-section__body">
        {logsLayout === "raw" ? (
          <div className="logs-raw-controls">
            <ViewToggle
              value={rawFilter}
              options={RAW_LOG_FILTERS}
              label="Raw log filter"
              onChange={(nextRawFilter) =>
                updatePreferences({ rawFilter: nextRawFilter })
              }
            />
            {rawFilter === "phases" ? (
              <ViewToggle
                value={phaseMode}
                options={PHASE_LOG_MODES}
                label="Phase history mode"
                onChange={(nextPhaseMode) =>
                  updatePreferences({ phaseMode: nextPhaseMode })
                }
              />
            ) : null}
          </div>
        ) : null}
        {!loaded ? null : eventCount === 0 ? (
          <div className="dash-empty">
            <strong>{empty.title}</strong>
            <span>{empty.body}</span>
          </div>
        ) : logsLayout === "timeline" ? (
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
          />
        ) : rawFilter === "all" ? (
          <LogsRawTable
            events={visibleRawEvents}
            phases={phases}
            metrics={metrics}
            pulses={pulses}
            tasks={tasks}
            expandedDumpIds={expandedDumpIds}
            onDeleteCheckIn={onDeleteCheckIn}
            onToggleDump={toggleDumpExpanded}
          />
        ) : (
          days.map((day) => (
            <DayArticle
              key={day.key}
              day={day}
              phases={phases}
              metrics={metrics}
              pulses={pulses}
              expandedDumpIds={expandedDumpIds}
              onDeleteCheckIn={onDeleteCheckIn}
              onToggleDump={toggleDumpExpanded}
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
