import { useMemo, useState } from "react";
import {
  DayStats,
  PhaseStrip,
  PhaseTotals,
} from "../components/DayReflection";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  INSIGHT_RANGES,
  readInsightRange,
  windowInsight,
  writeInsightRange,
  type InsightRangeKey,
} from "../lib/insights";

export function InsightsView() {
  const {
    tasks,
    taskStatusEvents,
    checkIns,
    phaseCheckIns,
    phases,
    loaded,
  } = useDashboardData();
  const [rangeKey, setRangeKey] = useState(readInsightRange);
  const range =
    INSIGHT_RANGES.find((item) => item.key === rangeKey) ?? INSIGHT_RANGES[1];

  const insight = useMemo(() => {
    const to = Math.floor(Date.now() / 1000);
    const from = to - range.seconds;
    return {
      from,
      to,
      ...windowInsight(
        tasks,
        taskStatusEvents,
        checkIns,
        phaseCheckIns,
        phases,
        from,
        to,
      ),
    };
  }, [tasks, taskStatusEvents, checkIns, phaseCheckIns, phases, range.seconds]);

  const selectRange = (key: InsightRangeKey) => {
    setRangeKey(key);
    writeInsightRange(key);
  };

  return (
    <section className="dash-section dash-section--insights">
      <div className="journal-toolbar">
        <div className="view-toggle" role="group" aria-label="Insights range">
          {INSIGHT_RANGES.map((item) => (
            <button
              key={item.key}
              type="button"
              className={
                rangeKey === item.key
                  ? "view-toggle__btn view-toggle__btn--active"
                  : "view-toggle__btn"
              }
              aria-pressed={rangeKey === item.key}
              onClick={() => selectRange(item.key)}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>
      {!loaded ? null : (
        <>
          <header className="insights-head">
            <DayStats stats={insight.stats} />
            <PhaseTotals sessions={insight.sessions} phases={phases} />
          </header>
          <PhaseStrip
            sessions={insight.stripSessions}
            phases={phases}
            from={insight.from}
            to={insight.to}
          />
        </>
      )}
    </section>
  );
}
