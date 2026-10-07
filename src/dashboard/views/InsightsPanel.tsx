import { useMemo } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { rangeInsight } from "../lib/insights";

/** The review of a range: Phases, Brain dumps, Tasks, and Metrics. Calendar
 * stacks them in its side column; the Overview Last hour tile (`tile`) sets
 * them side by side and scrolls them inside the tile. */
export function InsightsPanel({
  from,
  to,
  live,
  nowMs,
  nowSec,
  variant = "panel",
}: {
  from: number;
  to: number;
  live: boolean;
  nowMs: number;
  nowSec: number;
  variant?: "panel" | "tile";
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

  const insight = useMemo(
    () =>
      rangeInsight(
        {
          tasks,
          taskStatusEvents,
          taskWorkStretches,
          metrics,
          pulses,
          checkIns,
          phaseCheckIns,
          phases,
          brainDumps,
        },
        { from, to, live },
        { nowMs, nowSec, checkInNowMs: Date.now() },
      ),
    [
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
    ],
  );

  return (
    <div
      className={`insights-body${variant === "tile" ? " insights-body--tile" : ""}`}
    >
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
