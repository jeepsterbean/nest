import { useMemo, useState, type MouseEvent } from "react";
import { Eye } from "lucide-react";
import { deleteMetricCheckIn } from "../../lib/commands";
import { groupByDay } from "../lib/timeline";
import {
  buildLogExportEvents,
  buildLogsEvents,
  downloadLogDay,
  LOG_EVENT_BATCH_SIZE,
  LOG_KINDS,
  readLogsPreferences,
  soloLogKind,
  toggleLogKind,
  writeLogsPreferences,
  type LogKindKey,
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
import { LogsTimeline } from "./LogsTimeline";

const MIXED_EMPTY_COPY = {
  title: "Nothing here yet",
  body: "Metric check-ins, brain dumps, Phase changes, and Working now starts and stops will land here.",
};

const EMPTY_COPY: Record<LogKindKey, { title: string; body: string }> = {
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
  tasks: {
    title: "No work stretches yet",
    body: "Working now starts and stops will land here.",
  },
};

/** Multi-select filter chips, each tinted like its kind's timeline marks.
 * Double click isolates a kind from whatever its first click left behind. */
function LogKindToggle({
  kinds,
  onChange,
}: {
  kinds: LogKindKey[];
  onChange: (kinds: LogKindKey[]) => void;
}) {
  const onClick = (event: MouseEvent, key: LogKindKey) => {
    // The second click of a double click would only undo the first.
    if (event.detail > 1) return;
    onChange(toggleLogKind(kinds, key));
  };

  return (
    <div className="logs-kind-filter" role="group" aria-label="Logs filter">
      {LOG_KINDS.map((option) => (
        <button
          key={option.key}
          type="button"
          className={`logs-kind-filter__chip logs-kind-filter__chip--${option.key}`}
          aria-pressed={kinds.includes(option.key)}
          onClick={(event) => onClick(event, option.key)}
          onDoubleClick={() => onChange(soloLogKind(kinds, option.key))}
        >
          <span className="logs-kind-filter__dot" aria-hidden="true" />
          {option.label}
        </button>
      ))}
    </div>
  );
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
  // Not stored: returning to Phases alone always starts on the settled rows.
  const [everyPhaseCheckpoint, setEveryPhaseCheckpoint] = useState(false);
  const { kinds } = preferences;
  const phasesOnly = kinds.length === 1 && kinds[0] === "phases";
  const showsEveryPhaseCheckpoint = phasesOnly && everyPhaseCheckpoint;
  const nowMs = useCurrentTime();
  const historyFromSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
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

  const listEvents = useMemo(
    () =>
      buildLogsEvents(
        kinds,
        showsEveryPhaseCheckpoint,
        checkIns,
        phaseCheckIns,
        brainDumps,
        taskWorkStretches,
        historyFromSec,
      ),
    [
      kinds,
      showsEveryPhaseCheckpoint,
      checkIns,
      phaseCheckIns,
      brainDumps,
      taskWorkStretches,
      historyFromSec,
    ],
  );

  const visibleEvents = useMemo(
    () => listEvents.slice(0, visibleEventCount),
    [listEvents, visibleEventCount],
  );

  const updateKinds = (nextKinds: LogKindKey[]) => {
    const next = { kinds: nextKinds };
    writeLogsPreferences(next);
    setPreferences(next);
    setEveryPhaseCheckpoint(false);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
  };

  const toggleEveryPhaseCheckpoint = () => {
    setEveryPhaseCheckpoint((on) => !on);
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

  const empty = kinds.length === 1 ? EMPTY_COPY[kinds[0]] : MIXED_EMPTY_COPY;
  const eventCount = listEvents.length;
  const remainingEventCount = Math.max(0, eventCount - visibleEventCount);
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);

  return (
    <section className="dash-section dash-section--logs">
      <div className="dash-toolbar">
        <LogKindToggle kinds={kinds} onChange={updateKinds} />
        {phasesOnly ? (
          <button
            type="button"
            className={`logs-raw-toggle${everyPhaseCheckpoint ? " logs-raw-toggle--active" : ""}`}
            aria-pressed={everyPhaseCheckpoint}
            aria-label="Every Phase checkpoint"
            title="Every Phase checkpoint"
            onClick={toggleEveryPhaseCheckpoint}
          >
            <Eye aria-hidden="true" />
          </button>
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
        ) : (
          <LogsTimeline
            events={visibleEvents}
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
            showPhaseTotals={false}
            colorsTimeColumn={kinds.includes("phases")}
          />
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
