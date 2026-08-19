import { useEffect, useMemo, useState } from "react";
import { HISTORY_WINDOW_SECONDS } from "../context/DashboardDataContext";
import {
  INSIGHT_MODES,
  insightColumns,
  MODE_DAYS,
  readInsightMode,
  stepColumns,
  writeInsightMode,
  type InsightModeKey,
} from "../lib/insights";
import { shiftDayMs } from "../lib/time";
import { ViewToggle } from "./ViewToggle";

/** Day / Week plus Earlier / Later / Today. Shared by Calendar and Insights so
 * the stored range and paging guards cannot drift. */
export function useInsightRange() {
  const [mode, setMode] = useState(readInsightMode);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const columns = useMemo(
    () => insightColumns(mode, anchorMs, nowMs),
    [mode, anchorMs, nowMs],
  );
  const from = columns[0].from;
  const to = columns[columns.length - 1].to;
  const nowSec = Math.floor(nowMs / 1000);
  const canGoBack =
    stepColumns(mode, anchorMs, -1, nowMs)[0].from >=
    nowSec - HISTORY_WINDOW_SECONDS;
  const isNow = nowSec >= from && nowSec < to;
  const title =
    columns.length === 1
      ? columns[0].label
      : `${columns[0].label} – ${columns[columns.length - 1].label}`;

  const selectMode = (key: InsightModeKey) => {
    setMode(key);
    writeInsightMode(key);
  };
  const step = (direction: number) => {
    setAnchorMs((current) => shiftDayMs(current, direction * MODE_DAYS[mode]));
  };

  return {
    mode,
    columns,
    from,
    to,
    nowMs,
    nowSec,
    canGoBack,
    isNow,
    title,
    selectMode,
    step,
    goToday: () => setAnchorMs(Date.now()),
  };
}

export function InsightRangeBar({
  label,
  mode,
  title,
  canGoBack,
  isNow,
  onMode,
  onStep,
  onToday,
}: {
  label: string;
  mode: InsightModeKey;
  title: string;
  canGoBack: boolean;
  isNow: boolean;
  onMode: (key: InsightModeKey) => void;
  onStep: (direction: number) => void;
  onToday: () => void;
}) {
  return (
    <div className="dash-toolbar">
      <ViewToggle
        value={mode}
        options={INSIGHT_MODES}
        label={label}
        onChange={onMode}
      />
      <div className="insights-nav">
        <button
          type="button"
          aria-label="Earlier"
          disabled={!canGoBack}
          onClick={() => onStep(-1)}
        >
          ←
        </button>
        <span className="insights-nav__title">{title}</span>
        <button
          type="button"
          aria-label="Later"
          disabled={isNow}
          onClick={() => onStep(1)}
        >
          →
        </button>
        <button type="button" disabled={isNow} onClick={onToday}>
          Today
        </button>
      </div>
    </div>
  );
}
