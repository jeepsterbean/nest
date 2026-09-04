import { useMemo } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightLedger,
} from "../components/InsightBoard";
import { RangeToolbar } from "../components/RangeToolbar";
import { useDateRange } from "../hooks/useDateRange";
import { useDashboardData } from "../context/DashboardDataContext";
import { insightCheckIns, insightDays, windowInsight } from "../lib/insights";
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
  const range = useDateRange();

  const insight = useMemo(() => {
    const nowSec = range.nowSec;
    const closedTo = Math.min(range.to, nowSec);
    const blocks = layoutWorkBlocks(
      taskWorkStretches,
      tasks,
      range.from,
      range.to,
      range.nowMs,
    );
    const { sessions } = windowInsight(
      tasks,
      taskStatusEvents,
      checkIns,
      phaseCheckIns,
      phases,
      range.from,
      closedTo,
    );
    return {
      days: insightDays(
        range.columns,
        blocks,
        tasks,
        taskStatusEvents,
        nowSec,
      ),
      checkIns: insightCheckIns(checkIns, metrics, pulses, {
        from: range.from,
        to: closedTo,
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
    range.nowMs,
    range.nowSec,
  ]);

  return (
    <section className="dash-section dash-section--insights">
      <RangeToolbar
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
          <div className="insights-body">
            <PhaseMix sessions={insight.sessions} phases={phases} />
            <div className="insights-board">
              <InsightLedger days={insight.days} mode={range.mode} />
              <InsightCheckIns groups={insight.checkIns} />
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
