import type { CorePane } from "../lib/corePane";
// Behavior and invariants: docs/interface/calendar.md#insights
import { useMemo, type ReactNode } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightHideButton,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { rangeInsight } from "../lib/insights";
import type { LogKindKey } from "../lib/logs";

export function InsightsColumn({
  from,
  to,
  nowMs,
  nowSec,
  kinds,
  onToggleKind,
  onOpenCorePane,
}: {
  from: number;
  to: number;
  nowMs: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  onOpenCorePane: (pane: CorePane) => void;
}) {
  return (
    <div id="recap-insights" className="recap-body__insights" aria-label="Insights" role="region">
      <InsightsPanel
        from={from}
        to={to}
        nowMs={nowMs}
        nowSec={nowSec}
        kinds={kinds}
        onToggleKind={onToggleKind}
        onOpenCorePane={onOpenCorePane}
      />
    </div>
  );
}

/** The review of a range: Phases, Brain dumps, Tasks, and Metrics, stacked in
 * the side column. Each heading hides that kind for Insights, Logs, and Timeline. */
export function InsightsPanel({
  from,
  to,
  nowMs,
  nowSec,
  kinds,
  onToggleKind,
  onOpenCorePane,
}: {
  from: number;
  to: number;
  nowMs: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  onOpenCorePane: (pane: CorePane) => void;
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
        { from, to },
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
      nowMs,
      nowSec,
    ],
  );

  const shown = (key: LogKindKey) => kinds.includes(key);
  const alone = (key: LogKindKey) => shown(key) && kinds.length === 1;

  return (
    <div className="insights-body">
      <InsightSection label="Phases" shown={shown("phases")} alone={alone("phases")} onToggle={() => onToggleKind("phases")}>
        <PhaseMix sessions={insight.sessions} phases={phases} />
      </InsightSection>
      <InsightBrainDumps
        summary={insight.brainDumps}
        shown={shown("dumps")}
        alone={alone("dumps")}
        onToggle={() => onToggleKind("dumps")}
      />
      <InsightSection label="Tasks" shown={shown("tasks")} alone={alone("tasks")} onToggle={() => onToggleKind("tasks")}>
        <InsightLedger groups={insight.taskGroups} onOpenTasks={() => onOpenCorePane("tasks")} />
      </InsightSection>
      <InsightSection label="Metrics" shown={shown("metrics")} alone={alone("metrics")} onToggle={() => onToggleKind("metrics")}>
        <InsightCheckIns groups={insight.checkIns} onOpenMetrics={() => onOpenCorePane("metrics")} />
      </InsightSection>
    </div>
  );
}

function InsightSection({
  label,
  shown,
  alone,
  onToggle,
  children,
}: {
  label: string;
  shown: boolean;
  alone: boolean;
  onToggle: () => void;
  children: ReactNode;
}) {
  return (
    <section className="insight-list" aria-label={label}>
      <h3>
        {label}
        <InsightHideButton label={label} shown={shown} disabled={alone} onClick={onToggle} />
      </h3>
      {shown ? children : null}
    </section>
  );
}
