import type { CorePane } from "../lib/corePane";
// Behavior and invariants: docs/interface/calendar.md#timeline
import {
  useEffect,
  useMemo,
  useState,
} from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import {
  buildLogDayMarkerEvents,
  buildLogsEvents,
  logDayKeys,
  LOG_EMPTY_COPY,
  LOG_EVENT_BATCH_SIZE,
  MIXED_LOG_EMPTY_COPY,
  readLogsPreferences,
  toggleLogKind,
  writeLogsPreferences,
  type LogKindKey,
} from "../lib/logs";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useDatePagingKeys } from "../hooks/useDatePagingKeys";
import { useRecapDateRange } from "../hooks/useRecapDateRange";
import type { RecapPresentation } from "../lib/insights";
import { dayLabel, historyStartSec } from "../lib/time";
import { DateNavigation } from "../components/DateNavigation";
import { DateRangeSidebar } from "../components/DateRangeSidebar";
import { LogsRawToggle } from "../components/logs/LogKindToggle";
import { InsightsColumn } from "./InsightsPanel";
import { TimelineList } from "./TimelineList";

export function TimelineView({
  range,
  sidebarTarget,
  presentation,
  onPresentation,
  onOpenCorePane,
}: {
  range: ReturnType<typeof useRecapDateRange>;
  sidebarTarget: HTMLElement | null;
  presentation: RecapPresentation;
  onPresentation: (presentation: RecapPresentation) => void;
  onOpenCorePane: (pane: CorePane) => void;
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
  const [kinds, setKinds] = useState(() => readLogsPreferences().kinds);
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    () => new Set(),
  );
  // Not stored: returning to Phases alone always starts on the settled rows.
  const [everyPhaseCheckpoint, setEveryPhaseCheckpoint] = useState(false);
  const phasesOnly = kinds.length === 1 && kinds[0] === "phases";
  const showsEveryPhaseCheckpoint = phasesOnly && everyPhaseCheckpoint;
  const nowMs = useCurrentTime();
  const historyFromSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const dayMarkerEvents = useMemo(
    () =>
      buildLogDayMarkerEvents(
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
  const markedDays = useMemo(() => new Set(logDayKeys(dayMarkerEvents)), [dayMarkerEvents]);
  useEffect(() => { setVisibleEventCount(LOG_EVENT_BATCH_SIZE); }, [range.from]);
  const { canGoBack, isNow, step, goToday } = range;
  useDatePagingKeys(range);

  const updateKinds = (key: LogKindKey) => {
    const nextKinds = toggleLogKind(kinds, key);
    writeLogsPreferences({ kinds: nextKinds });
    setKinds(nextKinds);
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

  const empty = kinds.length === 1 ? LOG_EMPTY_COPY[kinds[0]] : MIXED_LOG_EMPTY_COPY;
  const eventCount = listEvents.length;
  const remainingEventCount = Math.max(0, eventCount - visibleEventCount);
  const nextBatchSize = Math.min(LOG_EVENT_BATCH_SIZE, remainingEventCount);

  return (
    <section className="dash-section dash-section--timeline">
      <DateRangeSidebar target={sidebarTarget} range={range}
        presentation={presentation} onPresentation={onPresentation}
        markedDays={markedDays} onPick={range.goToDay} />
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
          {phasesOnly ? (
            <LogsRawToggle
              active={everyPhaseCheckpoint}
              onClick={toggleEveryPhaseCheckpoint}
            />
          ) : null}
        </div>
      </div>
      <div className="dash-section__body recap-body">
        <div className="recap-body__grid">
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
        <InsightsColumn
          onOpenCorePane={onOpenCorePane}
          from={range.from}
          to={range.to}
          nowMs={range.nowMs}
          nowSec={range.nowSec}
          kinds={kinds}
          onToggleKind={updateKinds}
        />
      </div>
    </section>
  );
}
