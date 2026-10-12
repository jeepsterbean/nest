import type { CorePane } from "../lib/corePane";
// Behavior and invariants: docs/interface/calendar.md#insights
import { useMemo, type ReactNode } from "react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightHeading,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTileIcons } from "../hooks/useTileIcons";
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

/** The review of a range: Brain dumps, Tasks, Metrics, and Phases, stacked in
 * Core order. Each heading shows that kind's Core icon; the title opens that
 * kind in Core. Each heading hides that kind for Insights, Logs, and Timeline. */
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
  const icons = useTileIcons();

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
      <InsightBrainDumps
        summary={insight.brainDumps}
        icon={icons.brainDump}
        shown={shown("dumps")}
        alone={alone("dumps")}
        onToggle={() => onToggleKind("dumps")}
        onOpen={() => onOpenCorePane("brainDump")}
      />
      <InsightSection
        label="Tasks"
        icon={icons.tasks}
        shown={shown("tasks")}
        alone={alone("tasks")}
        onToggle={() => onToggleKind("tasks")}
        onOpen={() => onOpenCorePane("tasks")}
      >
        <InsightLedger groups={insight.taskGroups} />
      </InsightSection>
      <InsightSection
        label="Metrics"
        icon={icons.metrics}
        shown={shown("metrics")}
        alone={alone("metrics")}
        onToggle={() => onToggleKind("metrics")}
        onOpen={() => onOpenCorePane("metrics")}
      >
        <InsightCheckIns groups={insight.checkIns} />
      </InsightSection>
      <InsightSection
        label="Phases"
        icon={icons.phases}
        shown={shown("phases")}
        alone={alone("phases")}
        onToggle={() => onToggleKind("phases")}
        onOpen={() => onOpenCorePane("phases")}
      >
        <PhaseMix sessions={insight.sessions} phases={phases} />
      </InsightSection>
    </div>
  );
}

function InsightSection({
  label,
  icon,
  shown,
  alone,
  onToggle,
  onOpen,
  children,
}: {
  label: string;
  icon: string;
  shown: boolean;
  alone: boolean;
  onToggle: () => void;
  onOpen: () => void;
  children: ReactNode;
}) {
  return (
    <section className="insight-list" aria-label={label}>
      <InsightHeading
        label={label}
        icon={icon}
        shown={shown}
        alone={alone}
        onToggle={onToggle}
        onOpen={onOpen}
      />
      {shown ? children : null}
    </section>
  );
}
