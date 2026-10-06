import { useMemo, useState } from "react";
import { RangeToolbar } from "../components/RangeToolbar";
import { ViewToggle } from "../components/ViewToggle";
import { useCalendarRange } from "../hooks/useCalendarRange";
import {
  TimelineGrid,
  type GridColumn,
  type StretchEdit,
} from "../components/TimelineGrid";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  deleteTaskWorkStretch,
  renameTask,
  updateTaskWorkStretch,
} from "../../lib/commands";
import {
  CALENDAR_DISPLAYS,
  CALENDAR_RANGE_MODES,
  openAtPct,
  readCalendarDisplay,
  writeCalendarDisplay,
  type CalendarDisplay,
} from "../lib/insights";
import { isQuietPhase } from "../lib/period";
import { columnPhaseSessions } from "../lib/timeline";
import { layoutWorkBlocks } from "../lib/workTimeline";
import { InsightsPanel } from "./InsightsPanel";

export function CalendarView() {
  const { tasks, taskWorkStretches, phaseCheckIns, phases, loaded, mutate } =
    useDashboardData();
  const range = useCalendarRange();
  const [display, setDisplay] = useState<CalendarDisplay>(readCalendarDisplay);
  const [selected, setSelected] = useState<StretchEdit | null>(null);
  const showGrid = display !== "insights";
  const showInsights = display !== "calendar";

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

  return (
    <section className="dash-section dash-section--calendar">
      <RangeToolbar
        label="Calendar range"
        mode={range.mode}
        options={CALENDAR_RANGE_MODES}
        title={range.title}
        canGoBack={range.canGoBack}
        isNow={range.isNow}
        live={range.live}
        dayPicker={{
          earliestSec: range.earliestSec,
          nowMs: range.nowMs,
          selected: { from: range.from, to: range.to },
          onPick: (dayMs) => {
            range.goToDay(dayMs);
            setSelected(null);
          },
        }}
        onMode={(key) => {
          range.selectMode(key);
          setSelected(null);
        }}
        onStep={(direction) => {
          range.step(direction);
          setSelected(null);
        }}
        onToday={() => {
          range.goToday();
          setSelected(null);
        }}
      >
        <div className="calendar-display">
          <ViewToggle
            value={display}
            options={CALENDAR_DISPLAYS}
            label="Calendar display"
            onChange={(next) => {
              setDisplay(next);
              writeCalendarDisplay(next);
              setSelected(null);
            }}
          />
        </div>
      </RangeToolbar>
      <div className={`dash-section__body calendar-body calendar-body--${display}`}>
        {!loaded ? null : (
          <>
            {showGrid ? (
              <div className="calendar-body__grid">
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
              </div>
            ) : null}
            {showInsights ? (
              <div className="calendar-body__insights" aria-label="Insights" role="region">
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
