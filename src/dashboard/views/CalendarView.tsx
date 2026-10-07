import { useMemo, useState } from "react";
import { DateRangeSidebar } from "../components/DateRangeSidebar";
import { LogKindToggle } from "../components/logs/LogKindToggle";
import { ViewToggle } from "../components/ViewToggle";
import { PanelRight } from "lucide-react";
import { useCalendarRange } from "../hooks/useCalendarRange";
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
  readCalendarInsightsShown,
  writeCalendarFigure,
  writeCalendarInsightsShown,
  type CalendarFigure,
  type CalendarPresentation,
} from "../lib/insights";
import { isQuietPhase } from "../lib/period";
import { columnPhaseSessions } from "../lib/timeline";
import { layoutWorkBlocks } from "../lib/workTimeline";
import {
  buildLogsEvents,
  readLogsPreferences,
  writeLogsPreferences,
  type LogKindKey,
} from "../lib/logs";
import { logHours } from "../lib/logHours";
import { historyStartSec } from "../lib/time";
import { InsightsPanel } from "./InsightsPanel";
import { LogsHours, type LogsHoursColumn } from "./LogsHours";

export function CalendarView({
  sidebarTarget,
  presentation,
  onPresentation,
  range,
}: {
  sidebarTarget: HTMLElement | null;
  presentation: CalendarPresentation;
  onPresentation: (presentation: CalendarPresentation) => void;
  range: ReturnType<typeof useCalendarRange>;
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
  const [showInsights, setShowInsights] = useState(readCalendarInsightsShown);
  const [figure, setFigure] = useState(readCalendarFigure);
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

  const selectFigure = (next: CalendarFigure) => {
    setFigure(next);
    writeCalendarFigure(next);
    setSelected(null);
  };

  const updateKinds = (nextKinds: LogKindKey[]) => {
    const next = { ...readLogsPreferences(), kinds: nextKinds };
    writeLogsPreferences(next);
    setKinds(nextKinds);
  };

  return (
    <section className="dash-section dash-section--calendar">
      <DateRangeSidebar target={sidebarTarget} range={range}
        presentation={presentation} onPresentation={onPresentation}
        onMode={(mode) => { range.selectMode(mode); setSelected(null); }}
        onPick={(dayMs) => { range.goToDay(dayMs); setSelected(null); }}
        onToday={() => { range.goToday(); setSelected(null); }} />
      <div className="dash-toolbar calendar-panel-controls">
        <ViewToggle
          value={figure}
          options={CALENDAR_FIGURES}
          label="Calendar figure"
          onChange={selectFigure}
        />
        {figure === "logs" ? (
          <LogKindToggle kinds={kinds} label="Logs filter" onChange={updateKinds} />
        ) : null}
        <button type="button" className="calendar-insights-toggle"
          aria-pressed={showInsights} aria-controls="calendar-panel-insights"
          onClick={() => {
            setShowInsights(!showInsights);
            writeCalendarInsightsShown(!showInsights);
          }}><PanelRight aria-hidden="true" /><span>Insights</span></button>
      </div>
      <div className={`dash-section__body calendar-body${showInsights ? " calendar-body--both" : ""}`}>
        {!loaded ? null : (
          <>
            <div className="calendar-body__grid">
              {figure === "logs" ? (
                <LogsHours
                  columns={logsGrid.columns}
                  mode={range.gridMode}
                  span={range.span}
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
                    mode={range.gridMode}
                    span={range.span}
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
            {showInsights ? (
              <div id="calendar-panel-insights" className="calendar-body__insights" aria-label="Insights" role="region">
                <InsightsPanel
                  from={range.from}
                  to={range.to}
                  live={range.live}
                  nowMs={range.nowMs}
                  nowSec={range.nowSec}
                />
              </div>
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
