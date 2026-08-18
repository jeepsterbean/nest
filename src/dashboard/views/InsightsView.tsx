import { useEffect, useMemo, useState } from "react";
import { DayStats, PhaseTotals, TaskTotals } from "../components/DayReflection";
import {
  TimelineGrid,
  type GridColumn,
  type StretchEdit,
} from "../components/TimelineGrid";
import { ViewToggle } from "../components/ViewToggle";
import {
  HISTORY_WINDOW_SECONDS,
  useDashboardData,
} from "../context/DashboardDataContext";
import {
  deleteTaskWorkStretch,
  updateTaskWorkStretch,
} from "../../lib/commands";
import {
  INSIGHT_MODES,
  insightColumns,
  MODE_DAYS,
  openAtPct,
  readInsightMode,
  stepColumns,
  windowInsight,
  writeInsightMode,
  type InsightModeKey,
} from "../lib/insights";
import { phaseSessionsInWindow } from "../lib/timeline";
import { isQuietPhase } from "../lib/journal";
import { shiftDayMs } from "../lib/time";
import { layoutWorkBlocks } from "../lib/workTimeline";

export function InsightsView() {
  const {
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    checkIns,
    phaseCheckIns,
    phases,
    loaded,
    mutate,
  } = useDashboardData();
  const [mode, setMode] = useState(readInsightMode);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const [selected, setSelected] = useState<StretchEdit | null>(null);

  // The now line and any open stretch are only honest if the clock advances.
  const [nowMs, setNowMs] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const insight = useMemo(() => {
    const columns = insightColumns(mode, anchorMs, nowMs);
    const from = columns[0].from;
    const to = columns[columns.length - 1].to;
    const isQuiet = (phaseId: number | null) => isQuietPhase(phaseId, phases);
    const nowSec = Math.floor(nowMs / 1000);
    const grid: GridColumn[] = columns.map((column) => ({
      ...column,
      // Per column, so a Phase ribbon never spans midnight — and never past
      // now, since the last checkpoint would otherwise paint the rest of the
      // week in whatever Phase we happen to be in.
      sessions:
        column.from >= nowSec
          ? []
          : phaseSessionsInWindow(
              phaseCheckIns,
              column.from,
              Math.min(column.to, nowSec),
              isQuiet,
              false,
            ),
      blocks: layoutWorkBlocks(
        taskWorkStretches,
        tasks,
        column.from,
        column.to,
        nowMs,
      ),
    }));
    const blocks = grid.flatMap((column) => column.blocks);
    return {
      from,
      to,
      grid,
      blocks,
      nowSec,
      scrollPct: openAtPct(columns, nowSec, blocks[0]?.startPct ?? null),
      ...windowInsight(
        tasks,
        taskStatusEvents,
        checkIns,
        phaseCheckIns,
        phases,
        from,
        // Clamped too, or Phase totals would bank the rest of the week as
        // whatever Phase we are in right now.
        Math.min(to, nowSec),
      ),
    };
  }, [
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    checkIns,
    phaseCheckIns,
    phases,
    mode,
    anchorMs,
    nowMs,
  ]);

  const selectMode = (key: InsightModeKey) => {
    setMode(key);
    writeInsightMode(key);
    setSelected(null);
  };

  const step = (direction: number) => {
    setAnchorMs((current) => shiftDayMs(current, direction * MODE_DAYS[mode]));
    setSelected(null);
  };

  // Only the loaded history can be drawn, so paging stops where it ends. Ask
  // the page itself where it would start rather than predicting it.
  const canGoBack =
    stepColumns(mode, anchorMs, -1, nowMs)[0].from >=
    Math.floor(nowMs / 1000) - HISTORY_WINDOW_SECONDS;
  const isNow = insight.nowSec >= insight.from && insight.nowSec < insight.to;
  const title =
    insight.grid.length === 1
      ? insight.grid[0].label
      : `${insight.grid[0].label} – ${insight.grid[insight.grid.length - 1].label}`;

  return (
    <section className="dash-section dash-section--insights">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Insights</h2>
        </div>
      </header>
      <div className="journal-toolbar">
        <ViewToggle
          value={mode}
          options={INSIGHT_MODES}
          label="Insights range"
          onChange={selectMode}
        />
        <div className="insights-nav">
          <button
            type="button"
            aria-label="Earlier"
            disabled={!canGoBack}
            onClick={() => step(-1)}
          >
            ←
          </button>
          <span className="insights-nav__title">{title}</span>
          <button
            type="button"
            aria-label="Later"
            disabled={isNow}
            onClick={() => step(1)}
          >
            →
          </button>
          <button type="button" disabled={isNow} onClick={() => setAnchorMs(Date.now())}>
            Today
          </button>
        </div>
      </div>
      <div className="dash-section__body">
        {!loaded ? null : (
          <>
            <header className="insights-head">
              <DayStats stats={insight.stats} />
              <PhaseTotals sessions={insight.sessions} phases={phases} />
            </header>
            <TaskTotals blocks={insight.blocks} />
            {insight.blocks.length === 0 ? (
              <p className="dash-empty">No work recorded in this range.</p>
            ) : null}
            <TimelineGrid
              columns={insight.grid}
              phases={phases}
              mode={mode}
              scrollPct={insight.scrollPct}
              nowSec={insight.nowSec}
              selected={selected}
              onSelect={setSelected}
              onSave={async (id, startedAt, endedAt) => {
                const saved = await mutate(() =>
                  updateTaskWorkStretch(id, startedAt, endedAt),
                );
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
