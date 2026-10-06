import { useMemo } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  insightCheckInClosedTo,
  insightCheckIns,
  insightBrainDumps,
  insightTaskGroups,
  windowPhaseSessions,
} from "../lib/insights";
import { layoutWorkBlocks } from "../lib/workTimeline";

/** Calendar's review of its range: Phases, Brain dumps, Tasks, and Metrics. */
export function InsightsPanel({
  from,
  to,
  live,
  nowMs,
  nowSec,
}: {
  from: number;
  to: number;
  live: boolean;
  nowMs: number;
  nowSec: number;
}) {
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
  } = useDashboardData();

  const insight = useMemo(() => {
    const closedTo = Math.min(to, nowSec);
    const checkInTo = insightCheckInClosedTo(to, Date.now(), live);
    const blocks = layoutWorkBlocks(taskWorkStretches, tasks, from, to, nowMs);
    return {
      brainDumps: insightBrainDumps(brainDumps, { from, to: checkInTo }),
      taskGroups: insightTaskGroups(
        { from, to },
        blocks,
        tasks,
        taskStatusEvents,
        nowSec,
      ),
      checkIns: insightCheckIns(checkIns, metrics, pulses, {
        from,
        to: checkInTo,
      }),
      sessions: windowPhaseSessions(phaseCheckIns, phases, from, closedTo),
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
    from,
    to,
    live,
    nowMs,
    nowSec,
  ]);

  return (
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
  );
}
