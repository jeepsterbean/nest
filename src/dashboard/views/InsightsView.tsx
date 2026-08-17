import { useMemo, useState } from "react";
import {
  DayStats,
  PhaseStrip,
  PhaseTotals,
} from "../components/DayReflection";
import { ViewToggle } from "../components/ViewToggle";
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
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Insights</h2>
        </div>
      </header>
      <div className="journal-toolbar">
        <ViewToggle
          value={rangeKey}
          options={INSIGHT_RANGES}
          label="Insights range"
          onChange={selectRange}
        />
      </div>
      <div className="dash-section__body">
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
      </div>
    </section>
  );
}
