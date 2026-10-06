import { useMemo } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightLedger,
} from "../components/InsightBoard";
import { RangeToolbar } from "../components/RangeToolbar";
import { useInsightsRange } from "../hooks/useInsightsRange";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  INSIGHTS_RANGE_MODES,
  insightCheckInClosedTo,
  insightCheckIns,
  insightBrainDumps,
  insightTaskGroups,
  windowPhaseSessions,
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
    brainDumps,
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
    const sessions = windowPhaseSessions(
      phaseCheckIns,
      phases,
      range.from,
      closedTo,
    );
    return {
      brainDumps: insightBrainDumps(brainDumps, {
        from: range.from,
        to: checkInTo,
      }),
      taskGroups: insightTaskGroups(
        { from: range.from, to: range.to },
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
    brainDumps,
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    metrics,
    pulses,
    checkIns,
    phaseCheckIns,
    phases,
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
            <section className="insight-list" aria-label="Phases">
              <h3>Phases</h3>
              <PhaseMix sessions={insight.sessions} phases={phases} />
            </section>
            <InsightBrainDumps summary={insight.brainDumps} />
            <section className="insight-list" aria-label="Tasks">
              <h3>Tasks</h3>
              <InsightLedger groups={insight.taskGroups} />
            </section>
            <section className="insight-list" aria-label="Metrics">
              <h3>Metrics</h3>
              <InsightCheckIns groups={insight.checkIns} />
            </section>
          </div>
        )}
      </div>
    </section>
  );
}
