import { useMemo } from "react";
import { DayStats, PhaseTotals, TaskTotals } from "../components/DayReflection";
import {
  InsightRangeBar,
  useInsightRange,
} from "../components/InsightRangeBar";
import { useDashboardData } from "../context/DashboardDataContext";
import { windowInsight } from "../lib/insights";
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
  } = useDashboardData();
  const range = useInsightRange();

  const insight = useMemo(() => {
    const nowSec = range.nowSec;
    return {
      blocks: layoutWorkBlocks(
        taskWorkStretches,
        tasks,
        range.from,
        range.to,
        range.nowMs,
      ),
      ...windowInsight(
        tasks,
        taskStatusEvents,
        checkIns,
        phaseCheckIns,
        phases,
        range.from,
        // Clamped, or Phase totals would bank the rest of the week as
        // whatever Phase we are in right now.
        Math.min(range.to, nowSec),
      ),
    };
  }, [
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    checkIns,
    phaseCheckIns,
    phases,
    range.from,
    range.to,
    range.nowMs,
    range.nowSec,
  ]);

  return (
    <section className="dash-section dash-section--insights">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Insights</h2>
        </div>
      </header>
      <InsightRangeBar
        label="Insights range"
        mode={range.mode}
        title={range.title}
        canGoBack={range.canGoBack}
        isNow={range.isNow}
        onMode={range.selectMode}
        onStep={range.step}
        onToday={range.goToday}
      />
      <div className="dash-section__body">
        {!loaded ? null : (
          <>
            <header className="insights-head">
              <DayStats stats={insight.stats} />
              <PhaseTotals sessions={insight.sessions} phases={phases} />
            </header>
            <TaskTotals blocks={insight.blocks} />
          </>
        )}
      </div>
    </section>
  );
}
