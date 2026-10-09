// Behavior and invariants: docs/interface/calendar.md#timeline
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import { groupByDay } from "../lib/timeline";
import {
  buildLogExportEvents,
  buildLogsEvents,
  logDayKeys,
  downloadLogDay,
  LOG_EMPTY_COPY,
  LOG_EVENT_BATCH_SIZE,
  MIXED_LOG_EMPTY_COPY,
  readLogsPreferences,
  writeLogsPreferences,
  type LogKindKey,
  type LogsPreferences,
} from "../lib/logs";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useCalendarRange } from "../hooks/useCalendarRange";
import type { CalendarPresentation } from "../lib/insights";
import { dayLabel, historyStartSec } from "../lib/time";
import { DateNavigation } from "../components/DateNavigation";
import { DateRangeSidebar } from "../components/DateRangeSidebar";
import { LogKindToggle, LogsRawToggle } from "../components/logs/LogKindToggle";
import { TimelineList } from "./TimelineList";

export function TimelineView({
  range,
  sidebarTarget,
  presentation,
  onPresentation,
  onOpenDayInCalendarLogs,
}: {
  range: ReturnType<typeof useCalendarRange>;
  sidebarTarget: HTMLElement | null;
  presentation: CalendarPresentation;
  onPresentation: (presentation: CalendarPresentation) => void;
  onOpenDayInCalendarLogs: (dayMs: number) => void;
}) {
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
      ).filter((event) => event.at >= range.from && event.at < range.to),
    [
      range.from,
      range.to,
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

  const selectedDayMs = range.columns[0].from * 1000;
  const markedDays = useMemo(() => new Set(logDayKeys(exportEvents)), [exportEvents]);
  const batchRangeFrom = range.live ? null : range.from;
  useEffect(() => { setVisibleEventCount(LOG_EVENT_BATCH_SIZE); }, [range.mode, batchRangeFrom]);
  const { live, canGoBack, isNow, step, goToday } = range;
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.defaultPrevented || event.metaKey || event.ctrlKey || event.altKey || event.shiftKey) return;
      const target = event.target as HTMLElement | null;
      if (target?.isContentEditable || target?.closest("input, textarea, select, button, [role='dialog']")) return;
      if (event.key === "ArrowLeft" && !live && canGoBack) step(-1);
      else if (event.key === "ArrowRight" && !live && !isNow) step(1);
      else if (event.key === "t") goToday();
      else return;
      event.preventDefault();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [live, canGoBack, isNow, step, goToday]);

  const savePreferences = (next: LogsPreferences) => {
    writeLogsPreferences(next);
    setPreferences(next);
  };

  const updateKinds = (nextKinds: LogKindKey[]) => {
    savePreferences({ ...preferences, kinds: nextKinds });
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

  const empty = kinds.length === 1 ? LOG_EMPTY_COPY[kinds[0]] : MIXED_LOG_EMPTY_COPY;
  const eventCount = listEvents.length;
  const remainingEventCount = Math.max(0, eventCount - visibleEventCount);
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);

  return (
    <section className="dash-section dash-section--timeline">
      <DateRangeSidebar target={sidebarTarget} range={range}
        presentation={presentation} onPresentation={onPresentation}
        markedDays={markedDays} onMode={range.selectMode} onPick={range.goToDay} />
      <div className="dash-toolbar logs-toolbar">
        <div className="logs-toolbar__row">
          <DateNavigation
            label={dayLabel(selectedDayMs / 1000, nowMs)}
            unit="day"
            canGoPrevious={canGoBack}
            canGoNext={!isNow}
            onPrevious={() => step(-1)}
            onNext={() => step(1)}
            onToday={goToday}
          />
        </div>
        <div className="logs-toolbar__row">
          <LogKindToggle kinds={kinds} label="Timeline filter" onChange={updateKinds} />
          {phasesOnly ? (
            <LogsRawToggle
              active={everyPhaseCheckpoint}
              onClick={toggleEveryPhaseCheckpoint}
            />
          ) : null}
        </div>
      </div>
      <div
        className="dash-section__body"
      >
        {!loaded ? null : eventCount === 0 ? (
          <div className="dash-empty">
            <strong>{empty.title}</strong>
            <span>{empty.body}</span>
          </div>
        ) : null}
        {loaded && (eventCount > 0 || range.isNow) ? (
          <TimelineList
            showCurrentTime={range.isNow}
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
            onOpenDay={onOpenDayInCalendarLogs}
            nowMs={nowMs}
            colorsTimeColumn={kinds.includes("phases")}
          />
        ) : null}
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
