import { useMemo, useState } from "react";
import {
  DayStats,
  PhaseStrip,
  PhaseTotals,
  TimelineTicks,
} from "../components/DayReflection";
import {
  TaskTimeline,
  type StretchEdit,
} from "../components/TaskTimeline";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  deleteTaskWorkStretch,
  updateTaskWorkStretch,
} from "../../lib/commands";
import {
  INSIGHT_RANGES,
  readInsightRange,
  windowInsight,
  writeInsightRange,
  type InsightRangeKey,
} from "../lib/insights";
import { buildWorkLanes } from "../lib/workTimeline";

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
  const [rangeKey, setRangeKey] = useState(readInsightRange);
  const [selected, setSelected] = useState<StretchEdit | null>(null);
  const range =
    INSIGHT_RANGES.find((item) => item.key === rangeKey) ?? INSIGHT_RANGES[1];

  const insight = useMemo(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - range.seconds;
    return {
      from,
      to,
      lanes: buildWorkLanes(taskWorkStretches, tasks, from, to),
      ...windowInsight(
        tasks,
        taskStatusEvents,
        checkIns,
        phaseCheckIns,
        phases,
        from,
        to,
      ),
    };
  }, [
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    checkIns,
    phaseCheckIns,
    phases,
    range.seconds,
  ]);

  const selectRange = (key: InsightRangeKey) => {
    setRangeKey(key);
    writeInsightRange(key);
    setSelected(null);
  };

  return (
    <section className="dash-section dash-section--insights">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Insights</h2>
        </div>
      </header>
      <div className="journal-toolbar">
        <ViewToggle
          value={rangeKey}
          options={INSIGHT_RANGES}
          label="Insights range"
          onChange={selectRange}
        />
      </div>
      <div className="dash-section__body">
        {!loaded ? null : (
          <>
            <header className="insights-head">
              <DayStats stats={insight.stats} />
              <PhaseTotals sessions={insight.sessions} phases={phases} />
            </header>
            {/* One grid, so a work block and the Phase segment beneath it share
                a left edge and a single hour axis. */}
            <div className="insights-timeline">
              <PhaseStrip
                sessions={insight.sessions}
                phases={phases}
                from={insight.from}
                to={insight.to}
              />
              <TaskTimeline
                lanes={insight.lanes}
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
              <TimelineTicks from={insight.from} to={insight.to} />
            </div>
          </>
        )}
      </div>
    </section>
  );
}
