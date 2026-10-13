// Behavior and invariants: docs/interface/calendar.md
import type { Section } from "../lib/sections";
import { useEffect, useMemo, useState, type ReactNode } from "react";
import { DateNavigation } from "../components/DateNavigation";
import { useAppSettings } from "../hooks/useAppSettings";
import { useDatePagingKeys } from "../hooks/useDatePagingKeys";
import { useRecapDateRange } from "../hooks/useRecapDateRange";
import {
  TimelineGrid,
  type GridColumn,
  type StretchEdit,
} from "../components/TimelineGrid";
import { HISTORY_WINDOW_DAYS, useDashboardData } from "../context/DashboardDataContext";
import {
  deleteMetricCheckIn,
  deleteTaskWorkStretch,
  renameTask,
  updateTaskWorkStretch,
} from "../../lib/commands";
import {
  CALENDAR_FIGURES,
  openAtPct,
  readCalendarFigure,
  writeCalendarFigure,
  type CalendarFigure,
} from "../lib/insights";
import { isQuietPhase } from "../lib/period";
import { columnPhaseSessions } from "../lib/timeline";
import { layoutWorkBlocks } from "../lib/workTimeline";
import {
  buildLogsEvents,
  readLogsPreferences,
  toggleLogKind,
  writeLogsPreferences,
  type LogKindKey,
} from "../lib/logs";
import { logHours } from "../lib/logHours";
import { dayLabel, historyStartSec } from "../lib/time";
import { RecapInsights } from "./InsightsPanel";
import { LogsHours, type LogsHoursColumn } from "./LogsHours";

function CycleChoice<T extends string>({
  value,
  options,
  label,
  onChange,
}: {
  value: T;
  options: readonly { key: T; label: string }[];
  label: string;
  onChange: (key: T) => void;
}) {
  const selected = options.find((option) => option.key === value) ?? options[0];
  const next = options.find((option) => option.key !== selected.key) ?? selected;
  return (
    <button
      type="button"
      className="calendar-panel-controls__choice"
      aria-label={`${label}, ${selected.label}. Switch to ${next.label}`}
      title={`Switch to ${next.label}`}
      onClick={() => onChange(next.key)}
    >
      {selected.label}
    </button>
  );
}

export function CalendarView({
  onOpenSection,
  recapSwitches,
  sectionSidebar,
  range,
}: {
  onOpenSection: (section: Section) => void;
  recapSwitches: ReactNode;
  sectionSidebar: HTMLElement | null;
  range: ReturnType<typeof useRecapDateRange>;
}) {
  const {
    tasks,
    taskWorkStretches,
    taskStatusEvents,
    phaseCheckIns,
    phases,
    metrics,
    pulses,
    checkIns,
    brainDumps,
    loaded,
    mutate,
  } = useDashboardData();
  const showWorkStretch = useAppSettings().showWorkStretch;
  const [storedFigure, setFigure] = useState(readCalendarFigure);
  // The stored figure stays put while Work stretch is hidden, so showing it
  // again in Settings returns to the last choice.
  const figure = showWorkStretch ? storedFigure : "logs";
  const [kinds, setKinds] = useState(() => readLogsPreferences().kinds);
  const [selected, setSelected] = useState<StretchEdit | null>(null);

  const grid = useMemo(() => {
    const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
    const columns: GridColumn[] = range.columns.map((column) => ({
      ...column,
      sessions: columnPhaseSessions(phaseCheckIns, column, range.nowSec, isQuiet),
      blocks: layoutWorkBlocks(
        taskWorkStretches,
        tasks,
        column.from,
        column.to,
        range.nowMs,
      ),
    }));
    const blocks = columns.flatMap((column) => column.blocks);
    return {
      columns,
      scrollPct: openAtPct(
        range.columns,
        range.nowSec,
        blocks[0]?.startPct ?? null,
      ),
      empty: blocks.length === 0,
    };
  }, [
    tasks,
    taskWorkStretches,
    phaseCheckIns,
    phases,
    range.columns,
    range.nowMs,
    range.nowSec,
  ]);

  const logsGrid = useMemo(() => {
    const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
    const events = buildLogsEvents(
      kinds,
      false,
      checkIns,
      phaseCheckIns,
      brainDumps,
      taskWorkStretches,
      historyStartSec(range.nowMs, HISTORY_WINDOW_DAYS),
      taskStatusEvents,
    ).filter((event) => event.at >= range.from && event.at < range.to);
    const columns: LogsHoursColumn[] = range.columns.map((day) => ({
      ...day,
      sessions: kinds.includes("phases")
        ? columnPhaseSessions(phaseCheckIns, day, range.nowSec, isQuiet)
            .map((session) => ({
              ...session,
              from: Math.max(session.from, range.from),
              to: Math.min(session.to, range.to),
            }))
            .filter((session) => session.from < session.to)
        : [],
      hours: logHours(events, day.from, day.to),
    }));
    const firstLogged = columns.reduce<{ at: number; pct: number } | null>((earliest, column) => {
      const hour = column.hours[0];
      if (!hour || (earliest && hour.from >= earliest.at)) return earliest;
      return {
        at: hour.from,
        pct: ((hour.from - column.from) / (column.to - column.from)) * 100,
      };
    }, null);
    return {
      columns,
      scrollPct: openAtPct(range.columns, range.nowSec, firstLogged?.pct ?? null),
    };
  }, [
    kinds,
    checkIns,
    phaseCheckIns,
    brainDumps,
    taskWorkStretches,
    taskStatusEvents,
    phases,
    range.columns,
    range.from,
    range.to,
    range.nowMs,
    range.nowSec,
  ]);

  useDatePagingKeys(range);
  // The stretch editor belongs to a block on screen, so paging away closes it.
  useEffect(() => setSelected(null), [range.from, range.to]);

  const selectFigure = (next: CalendarFigure) => {
    setFigure(next);
    writeCalendarFigure(next);
    setSelected(null);
  };

  const updateKinds = (key: LogKindKey) => {
    const nextKinds = toggleLogKind(kinds, key);
    writeLogsPreferences({ ...readLogsPreferences(), kinds: nextKinds });
    setKinds(nextKinds);
  };

  return (
    <section className="dash-section dash-section--calendar">
      <div className="dash-toolbar recap-toolbar calendar-panel-controls">
        <DateNavigation
          label={range.mode === "day" ? dayLabel(range.from, range.nowMs) : range.title}
          unit={range.mode}
          canGoPrevious={range.canGoBack}
          canGoNext={!range.isNow}
          onPrevious={() => range.step(-1)}
          onNext={() => range.step(1)}
          onToday={range.goToday}
          picker={range.picker}
        />
        <div className="recap-toolbar__display">
          {showWorkStretch && (
            <CycleChoice
              value={figure}
              options={CALENDAR_FIGURES}
              label="Calendar figure"
              onChange={selectFigure}
            />
          )}
          {recapSwitches}
        </div>
      </div>
      <div className="dash-section__body recap-body">
        {!loaded ? null : (
          <>
            <div className="recap-body__grid">
              {figure === "logs" ? (
                <LogsHours
                  columns={logsGrid.columns}
                  mode={range.mode}
                  phases={phases}
                  metrics={metrics}
                  pulses={pulses}
                  tasks={tasks}
                  scrollPct={logsGrid.scrollPct}
                  nowSec={range.nowSec}
                  onDeleteCheckIn={(id) => {
                    void mutate(() => deleteMetricCheckIn(id));
                  }}
                />
              ) : (
                <>
                  {grid.empty ? (
                    <p className="dash-empty">No work recorded in this range.</p>
                  ) : null}
                  <TimelineGrid
                    columns={grid.columns}
                    phases={phases}
                    mode={range.mode}
                    scrollPct={grid.scrollPct}
                    nowSec={range.nowSec}
                    selected={selected}
                    onSelect={setSelected}
                    onSave={async (id, startedAt, endedAt, rename) => {
                      const saved = await mutate(async () => {
                        // Two commands, no transaction: run the one the backend can
                        // reject first, so a refused time change leaves no rename
                        // behind. Renaming only fails on an empty title, and the
                        // field already blocks that.
                        await updateTaskWorkStretch(id, startedAt, endedAt);
                        if (rename) await renameTask(rename.taskId, rename.title);
                      });
                      if (saved) setSelected(null);
                    }}
                    onDelete={async (id) => {
                      const removed = await mutate(() => deleteTaskWorkStretch(id));
                      if (removed) setSelected(null);
                    }}
                  />
                </>
              )}
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
          </>
        )}
      </div>
    </section>
  );
}
