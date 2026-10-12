import type { CorePane } from "../lib/corePane";
// Behavior and invariants: docs/interface/calendar.md#insights
import { useMemo, type ReactNode } from "react";
import { PanelRight } from "lucide-react";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightHideButton,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { lastHourSpanLabel, rangeInsight } from "../lib/insights";
import type { LogKindKey } from "../lib/logs";

/** Opens or closes the Insights column. The same choice on Calendar and Timeline. */
export function InsightsToggle({
  shown,
  onToggle,
}: {
  shown: boolean;
  onToggle: () => void;
}) {
  return (
    <button
      type="button"
      className="recap-insights-toggle"
      aria-pressed={shown}
      aria-controls="recap-insights"
      onClick={onToggle}
    >
      <PanelRight aria-hidden="true" />
      <span>Insights</span>
    </button>
  );
}

export function InsightsColumn({
  from,
  to,
  live,
  nowMs,
  nowSec,
  kinds,
  onToggleKind,
  lastHour,
  onLastHour,
  onOpenCorePane,
}: {
  from: number;
  to: number;
  live: boolean;
  nowMs: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  lastHour: boolean;
  onLastHour: (on: boolean) => void;
  onOpenCorePane: (pane: CorePane) => void;
}) {
  return (
    <div id="recap-insights" className="recap-body__insights" aria-label="Insights" role="region">
      <InsightsPanel
        from={from}
        to={to}
        live={live}
        nowMs={nowMs}
        nowSec={nowSec}
        kinds={kinds}
        onToggleKind={onToggleKind}
        lastHour={lastHour}
        onLastHour={onLastHour}
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
  live,
  nowMs,
  nowSec,
  kinds,
  onToggleKind,
  lastHour,
  onLastHour,
  onOpenCorePane,
}: {
  from: number;
  to: number;
  live: boolean;
  nowMs: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  lastHour: boolean;
  onLastHour: (on: boolean) => void;
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

  const shown = (key: LogKindKey) => kinds.includes(key);
  const alone = (key: LogKindKey) => shown(key) && kinds.length === 1;

  return (
    <div className="insights-body">
      <div className="insights-window">
        <button
          type="button"
          className="insights-window__last-hour"
          aria-pressed={lastHour}
          onClick={() => onLastHour(!lastHour)}
        >
          Last hour
        </button>
        {lastHour ? (
          <span className="insights-window__span">{lastHourSpanLabel(nowSec)}</span>
        ) : null}
      </div>
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
