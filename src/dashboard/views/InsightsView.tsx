import { useMemo } from "react";
import { DayStats, PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightLedger,
} from "../components/InsightBoard";
import { RangeToolbar } from "../components/RangeToolbar";
import { useInsightsRange } from "../hooks/useInsightsRange";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  INSIGHTS_RANGE_MODES,
  insightCheckInClosedTo,
  insightCheckIns,
  insightDays,
  windowInsight,
} from "../lib/insights";
import { layoutWorkBlocks } from "../lib/workTimeline";

export function InsightsView() {
  const {
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    metrics,
    pulses,
    checkIns,
    phaseCheckIns,
    phases,
    loaded,
  } = useDashboardData();
  const range = useInsightsRange();

  const insight = useMemo(() => {
    const nowSec = range.nowSec;
    const closedTo = Math.min(range.to, nowSec);
    const checkInTo = insightCheckInClosedTo(range.to, Date.now(), range.live);
    const blocks = layoutWorkBlocks(
      taskWorkStretches,
      tasks,
      range.from,
      range.to,
      range.nowMs,
    );
    const { stats, sessions } = windowInsight(
      tasks,
      taskStatusEvents,
      checkIns,
      phaseCheckIns,
      phases,
      range.from,
      closedTo,
      checkInTo,
    );
    return {
      stats,
      days: insightDays(
        range.columns,
        blocks,
        tasks,
        taskStatusEvents,
        nowSec,
      ),
      checkIns: insightCheckIns(checkIns, metrics, pulses, {
        from: range.from,
        to: checkInTo,
      }),
      sessions,
    };
  }, [
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    metrics,
    pulses,
    checkIns,
    phaseCheckIns,
    phases,
    range.columns,
    range.from,
    range.to,
    range.live,
    range.nowMs,
    range.nowSec,
  ]);

  return (
    <section className="dash-section dash-section--insights">
      <RangeToolbar
        label="Insights range"
        mode={range.mode}
        options={INSIGHTS_RANGE_MODES}
        title={range.title}
        canGoBack={range.canGoBack}
        isNow={range.isNow}
        live={range.live}
        dayPicker={{
          earliestSec: range.earliestSec,
          nowMs: range.nowMs,
          selected: { from: range.from, to: range.to },
          onPick: range.goToDay,
        }}
        onMode={range.selectMode}
        onStep={range.step}
        onToday={range.goToday}
      />
      <div className="dash-section__body">
        {!loaded ? null : (
          <div className="insights-body">
            <div className="insight-summary">
              <DayStats stats={insight.stats} />
              <PhaseMix sessions={insight.sessions} phases={phases} />
            </div>
            <div className="insights-board">
              <InsightLedger
                days={insight.days}
                mode={range.mode === "week" ? "week" : "day"}
              />
              <InsightCheckIns groups={insight.checkIns} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
