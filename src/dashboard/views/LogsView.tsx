import {
  useEffect,
  useLayoutEffect,
  useMemo,
  useRef,
  useState,
  type MouseEvent,
} from "react";
import { Eye } from "lucide-react";
import { deleteMetricCheckIn } from "../../lib/commands";
import { columnPhaseSessions, groupByDay } from "../lib/timeline";
import {
  adjacentLogDay,
  buildLogExportEvents,
  buildLogsEvents,
  downloadLogDay,
  LOG_EVENT_BATCH_SIZE,
  LOG_KINDS,
  LOG_SCALES,
  logDayKeys,
  logEventCountThroughDay,
  logJumpDay,
  LOGS_RANGE_STORE,
  readLogsPreferences,
  soloLogKind,
  toggleLogKind,
  writeLogsPreferences,
  type LogKindKey,
  type LogScaleKey,
  type LogsPreferences,
} from "../lib/logs";
import { logHours } from "../lib/logHours";
import { openAtPct } from "../lib/insights";
import { isQuietPhase } from "../lib/period";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useDateRange } from "../hooks/useDateRange";
import { historyStartSec, startOfDayMs } from "../lib/time";
import { RangeNav } from "../components/RangeToolbar";
import { ViewToggle } from "../components/ViewToggle";
import { DayExportButton, LogsTimeline } from "./LogsTimeline";
import { LogsHours, type LogsHoursColumn } from "./LogsHours";

const MIXED_EMPTY_COPY = {
  title: "Nothing here yet",
  body: "Metric check-ins, brain dumps, Phase changes, and task activity will land here.",
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
    title: "No task activity yet",
    body: "Task creation, status changes, and Working now starts and stops will land here.",
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
    taskStatusEvents,
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
  // Not stored: returning to Phases alone always starts on the settled rows.
  const [everyPhaseCheckpoint, setEveryPhaseCheckpoint] = useState(false);
  const { kinds, scale } = preferences;
  const range = useDateRange(LOGS_RANGE_STORE);
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
        taskStatusEvents,
      ),
    [
      brainDumps,
      checkIns,
      historyFromSec,
      phaseCheckIns,
      taskWorkStretches,
      taskStatusEvents,
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
        taskStatusEvents,
      ),
    [
      kinds,
      showsEveryPhaseCheckpoint,
      checkIns,
      phaseCheckIns,
      brainDumps,
      taskWorkStretches,
      taskStatusEvents,
      historyFromSec,
    ],
  );

  const visibleEvents = useMemo(
    () => listEvents.slice(0, visibleEventCount),
    [listEvents, visibleEventCount],
  );

  const hoursDay = useMemo(() => {
    const day = range.columns[0];
    const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
    const column: LogsHoursColumn = {
      ...day,
      sessions: kinds.includes("phases")
        ? columnPhaseSessions(phaseCheckIns, day, range.nowSec, isQuiet)
        : [],
      hours: logHours(listEvents, day.from, day.to),
    };
    const firstHour = column.hours[0];
    return {
      column,
      scrollPct: openAtPct(
        range.columns,
        range.nowSec,
        firstHour ? ((firstHour.from - day.from) / (day.to - day.from)) * 100 : null,
      ),
    };
  }, [kinds, listEvents, phaseCheckIns, phases, range.columns, range.nowSec]);

  // List and Hours share the selected day. List follows it by scrolling to
  // that day's group and reports it back as the reader scrolls.
  const selectedDayMs = range.columns[0].from * 1000;
  const todayMs = startOfDayMs(range.nowSec);
  const dayKeys = useMemo(() => logDayKeys(listEvents), [listEvents]);
  const markedDays = useMemo(() => new Set(dayKeys), [dayKeys]);
  const bodyRef = useRef<HTMLDivElement>(null);
  const [listJumpDayMs, setListJumpDayMs] = useState<number | null>(null);
  // A jump's own scroll event must not be read back as the reader's position.
  const ignoreNextScrollRef = useRef(false);
  const goToDay = range.goToDay;

  useLayoutEffect(() => {
    if (listJumpDayMs === null || scale !== "list" || !loaded) return;
    const newestDayMs = dayKeys[0];
    const targetDayMs =
      newestDayMs === undefined || listJumpDayMs >= newestDayMs
        ? null
        : logJumpDay(dayKeys, listJumpDayMs);
    if (targetDayMs !== null) {
      const needed = logEventCountThroughDay(listEvents, targetDayMs);
      if (visibleEventCount < needed) {
        setVisibleEventCount(needed);
        return;
      }
      if (targetDayMs !== listJumpDayMs) goToDay(targetDayMs);
    }
    setListJumpDayMs(null);
    const body = bodyRef.current;
    if (!body) return;
    const group =
      targetDayMs === null
        ? null
        : body.querySelector<HTMLElement>(`[data-day-key="${targetDayMs}"]`);
    const top = group
      ? group.getBoundingClientRect().top -
        body.getBoundingClientRect().top +
        body.scrollTop
      : 0;
    if (Math.round(body.scrollTop) === Math.round(top)) return;
    ignoreNextScrollRef.current = true;
    body.scrollTop = top;
  }, [
    dayKeys,
    goToDay,
    listEvents,
    listJumpDayMs,
    loaded,
    scale,
    visibleEventCount,
  ]);

  const onBodyScroll = () => {
    if (scale !== "list") return;
    if (ignoreNextScrollRef.current) {
      ignoreNextScrollRef.current = false;
      return;
    }
    const body = bodyRef.current;
    if (!body) return;
    const bodyTop = body.getBoundingClientRect().top;
    let readingDayMs: number | null = null;
    for (const group of body.querySelectorAll<HTMLElement>("[data-day-key]")) {
      // A day counts as read once its label reaches the top edge.
      if (group.getBoundingClientRect().top - bodyTop > 24) break;
      readingDayMs = Number(group.dataset.dayKey);
    }
    // Above the first group, keep a picked day newer than every entry (an
    // empty Today) rather than snapping back to the newest group.
    if (readingDayMs === null) {
      const newestDayMs = dayKeys[0];
      if (newestDayMs === undefined || selectedDayMs > newestDayMs) return;
      readingDayMs = newestDayMs;
    }
    if (readingDayMs !== selectedDayMs) goToDay(readingDayMs);
  };

  const showDay = (dayMs: number) => {
    goToDay(dayMs);
    if (scale === "list") setListJumpDayMs(dayMs);
  };

  const listCanGoBack = adjacentLogDay(dayKeys, selectedDayMs, -1) !== null;
  const canGoBack = scale === "list" ? listCanGoBack : range.canGoBack;

  // List has no row for an empty day, so it pages between days with entries.
  const stepDay = (direction: number) => {
    if (scale !== "list") {
      range.step(direction);
      return;
    }
    const nextDayMs = adjacentLogDay(
      dayKeys,
      selectedDayMs,
      direction < 0 ? -1 : 1,
    );
    if (nextDayMs !== null) showDay(nextDayMs);
    else if (direction > 0) showDay(todayMs);
  };

  const showToday = () => showDay(todayMs);

  const isToday = range.isNow;
  const keyboardNavRef = useRef({ stepDay, showToday, canGoBack, isToday });
  keyboardNavRef.current = { stepDay, showToday, canGoBack, isToday };

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented) return;
      if (event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (
        target?.isContentEditable ||
        target?.closest("input, textarea, select, [role='dialog']")
      ) {
        return;
      }
      const nav = keyboardNavRef.current;
      if (event.key === "ArrowLeft") {
        if (!nav.canGoBack) return;
        nav.stepDay(-1);
      } else if (event.key === "ArrowRight") {
        if (nav.isToday) return;
        nav.stepDay(1);
      } else if (event.key === "t") {
        nav.showToday();
      } else {
        return;
      }
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, []);

  const savePreferences = (next: LogsPreferences) => {
    writeLogsPreferences(next);
    setPreferences(next);
  };

  const selectScale = (nextScale: LogScaleKey) => {
    savePreferences({ ...preferences, scale: nextScale });
    if (nextScale === "list") setListJumpDayMs(selectedDayMs);
  };

  const openDayInHours = (dayMs: number) => {
    savePreferences({ ...preferences, scale: "hours" });
    goToDay(dayMs);
  };

  const updateKinds = (nextKinds: LogKindKey[]) => {
    savePreferences({ ...preferences, kinds: nextKinds });
    setEveryPhaseCheckpoint(false);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
    if (scale === "list") setListJumpDayMs(selectedDayMs);
  };

  const toggleEveryPhaseCheckpoint = () => {
    setEveryPhaseCheckpoint((on) => !on);
    setVisibleEventCount(LOG_EVENT_BATCH_SIZE);
    setListJumpDayMs(selectedDayMs);
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
      {/* Row one answers when and how to read; row two answers what. Each
          slot keeps its place across List and Hours so nothing jumps. */}
      <div className="dash-toolbar logs-toolbar">
        <div className="logs-toolbar__row">
          <RangeNav
            title={range.title}
            canGoBack={canGoBack}
            isNow={isToday}
            dayPicker={{
              earliestSec: range.earliestSec,
              nowMs: range.nowMs,
              selected: { from: range.from, to: range.to },
              markedDays,
              onPick: showDay,
            }}
            onStep={stepDay}
            onToday={showToday}
          />
          <DayExportButton
            label={range.title}
            dayKey={selectedDayMs}
            onExportDay={exportDay}
          />
          <div className="logs-toolbar__end">
            <ViewToggle
              value={scale}
              options={LOG_SCALES}
              label="Logs scale"
              onChange={selectScale}
            />
          </div>
        </div>
        <div className="logs-toolbar__row">
          <LogKindToggle kinds={kinds} onChange={updateKinds} />
          {scale === "list" && phasesOnly ? (
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
        </div>
      </div>
      <div
        ref={bodyRef}
        className="dash-section__body"
        onScroll={onBodyScroll}
      >
        {!loaded ? null : scale === "hours" ? (
          <>
            {hoursDay.column.hours.length === 0 && hoursDay.column.sessions.length === 0 ? (
              <p className="dash-empty">Nothing logged on this day.</p>
            ) : null}
            <LogsHours
              column={hoursDay.column}
              phases={phases}
              metrics={metrics}
              pulses={pulses}
              tasks={tasks}
              scrollPct={hoursDay.scrollPct}
              nowSec={range.nowSec}
              onDeleteCheckIn={onDeleteCheckIn}
            />
          </>
        ) : eventCount === 0 ? (
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
            onOpenDay={openDayInHours}
            nowMs={nowMs}
            showPhaseTotals={false}
            colorsTimeColumn={kinds.includes("phases")}
          />
        )}
        {loaded && scale === "list" && remainingEventCount > 0 ? (
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
