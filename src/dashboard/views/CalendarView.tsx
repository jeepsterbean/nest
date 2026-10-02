import { useMemo, useState } from "react";
import { RangeToolbar } from "../components/RangeToolbar";
import { useDateRange } from "../hooks/useDateRange";
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
import { openAtPct, RANGE_MODES } from "../lib/insights";
import { isQuietPhase } from "../lib/period";
import { columnPhaseSessions } from "../lib/timeline";
import { layoutWorkBlocks } from "../lib/workTimeline";

export function CalendarView() {
  const { tasks, taskWorkStretches, phaseCheckIns, phases, loaded, mutate } =
    useDashboardData();
  const range = useDateRange();
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

  return (
    <section className="dash-section dash-section--calendar">
      <RangeToolbar
        label="Calendar range"
        mode={range.mode}
        options={RANGE_MODES}
        title={range.title}
        canGoBack={range.canGoBack}
        isNow={range.isNow}
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
      />
      <div className="dash-section__body">
        {!loaded ? null : (
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
    </section>
  );
}
