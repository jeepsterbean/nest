import { COLLAPSED_SECTION_SIDEBAR, type Section } from "../lib/sections";
// Behavior and invariants: docs/interface/calendar.md#insights
import { useMemo, type ReactNode } from "react";
import { createPortal } from "react-dom";
import { PhaseMix } from "../components/DayReflection";
import {
  InsightCheckIns,
  InsightBrainDumps,
  InsightHeading,
  InsightLedger,
} from "../components/InsightBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useTileIcons } from "../hooks/useTileIcons";
import { rangeInsight } from "../lib/insights";
import type { LogKindKey } from "../lib/logs";

// Matches the width in shell.css where the Section sidebar collapses to a
// strip too thin to hold Insights.

/** Insights for the Recap range. It lives in the Section sidebar, and moves
 * under the figure while that sidebar is collapsed. */
export function RecapInsights({
  sectionSidebar,
  from,
  to,
  nowSec,
  kinds,
  onToggleKind,
  onOpenSection,
}: {
  sectionSidebar: HTMLElement | null;
  from: number;
  to: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  onOpenSection: (section: Section) => void;
}) {
  const underFigure = useMediaQuery(COLLAPSED_SECTION_SIDEBAR);
  if (!underFigure && !sectionSidebar) return null;

  const insights = (
    <div id="recap-insights" className="recap-insights" aria-label="Insights" role="region">
      <InsightsPanel
        from={from}
        to={to}
        nowSec={nowSec}
        kinds={kinds}
        onToggleKind={onToggleKind}
        onOpenSection={onOpenSection}
      />
    </div>
  );
  return underFigure || !sectionSidebar
    ? insights
    : createPortal(insights, sectionSidebar);
}

/** The review of a range: Brain dumps, Tasks, Metrics, and Phases, stacked in
 * Sidebar order. Each heading shows that kind's Section icon; the title opens
 * that Section. Each heading hides that kind for Insights, Logs, and Timeline. */
export function InsightsPanel({
  from,
  to,
  nowSec,
  kinds,
  onToggleKind,
  onOpenSection,
}: {
  from: number;
  to: number;
  nowSec: number;
  kinds: LogKindKey[];
  onToggleKind: (key: LogKindKey) => void;
  onOpenSection: (section: Section) => void;
}) {
  const {
    tasks,
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
          metrics,
          pulses,
          checkIns,
          phaseCheckIns,
          phases,
          brainDumps,
        },
        { from, to },
        { nowSec, checkInNowMs: Date.now() },
      ),
    [
      brainDumps,
      tasks,
      metrics,
      pulses,
      checkIns,
      phaseCheckIns,
      phases,
      from,
      to,
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
        onOpen={() => onOpenSection("brainDump")}
      />
      <InsightSection
        label="Tasks"
        icon={icons.tasks}
        shown={shown("tasks")}
        alone={alone("tasks")}
        onToggle={() => onToggleKind("tasks")}
        onOpen={() => onOpenSection("tasks")}
      >
        <InsightLedger counts={insight.taskCounts} />
      </InsightSection>
      <InsightSection
        label="Metrics"
        icon={icons.metrics}
        shown={shown("metrics")}
        alone={alone("metrics")}
        onToggle={() => onToggleKind("metrics")}
        onOpen={() => onOpenSection("metrics")}
      >
        <InsightCheckIns groups={insight.checkIns} />
      </InsightSection>
      <InsightSection
        label="Phases"
        icon={icons.phases}
        shown={shown("phases")}
        alone={alone("phases")}
        onToggle={() => onToggleKind("phases")}
        onOpen={() => onOpenSection("phases")}
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
