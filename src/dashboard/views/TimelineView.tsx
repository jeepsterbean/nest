// Behavior and invariants: docs/interface/calendar.md#timeline
import type { Section } from "../lib/sections";
import {
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import {
  buildLogsEvents,
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
import { dayLabel, historyStartSec } from "../lib/time";
import { DateNavigation } from "../components/DateNavigation";
import { LogsRawToggle } from "../components/logs/LogKindToggle";
import { RecapInsights } from "./InsightsPanel";
import { TimelineList } from "./TimelineList";

export function TimelineView({
  range,
  onOpenSection,
  recapSwitches,
  sectionSidebar,
}: {
  range: ReturnType<typeof useRecapDateRange>;
  onOpenSection: (section: Section) => void;
  recapSwitches: ReactNode;
  sectionSidebar: HTMLElement | null;
}) {
  const {
    metrics,
    pulses,
    phases,
    tasks,
    checkIns,
    phaseCheckIns,
    notes,
    taskWorkStretches,
    taskStatusEvents,
    loaded,
    mutate,
  } = useDashboardData();
  const [kinds, setKinds] = useState(() => readLogsPreferences().kinds);
  const [visibleEventCount, setVisibleEventCount] = useState(
    LOG_EVENT_BATCH_SIZE,
  );
  const [expandedNoteIds, setExpandedNoteIds] = useState<Set<number>>(
    () => new Set(),
  );
  // Not stored: returning to Phases alone always starts on the settled rows.
  const [everyPhaseCheckpoint, setEveryPhaseCheckpoint] = useState(false);
  const phasesOnly = kinds.length === 1 && kinds[0] === "phases";
  const showsEveryPhaseCheckpoint = phasesOnly && everyPhaseCheckpoint;
  const nowMs = useCurrentTime();
  const historyFromSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const listEvents = useMemo(
    () =>
      buildLogsEvents(
        kinds,
        showsEveryPhaseCheckpoint,
        checkIns,
        phaseCheckIns,
        notes,
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
      notes,
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

  const toggleNoteExpanded = (id: number) => {
    setExpandedNoteIds((prev) => {
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
      <div className="dash-toolbar recap-toolbar logs-toolbar">
        <div className="logs-toolbar__row">
          <DateNavigation
            label={dayLabel(selectedDayMs / 1000, nowMs)}
            unit="day"
            canGoPrevious={canGoBack}
            canGoNext={!isNow}
            onPrevious={() => step(-1)}
            onNext={() => step(1)}
            onToday={goToday}
            picker={range.picker}
          />
          {phasesOnly ? (
            <LogsRawToggle
              active={everyPhaseCheckpoint}
              onClick={toggleEveryPhaseCheckpoint}
            />
          ) : null}
          <div className="recap-toolbar__display">{recapSwitches}</div>
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
              expandedNoteIds={expandedNoteIds}
              onDeleteCheckIn={onDeleteCheckIn}
              onToggleNote={toggleNoteExpanded}
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
        <RecapInsights
          sectionSidebar={sectionSidebar}
          onOpenSection={onOpenSection}
          from={range.from}
          to={range.to}
          nowSec={range.nowSec}
          kinds={kinds}
          onToggleKind={updateKinds}
        />
      </div>
    </section>
  );
}
