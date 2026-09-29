import { useState } from "react";
import {
  INSIGHTS_RANGE_STORE,
  lastHourColumn,
  lastHourPeriod,
  lastHourSpanLabel,
  readInsightsRangeMode,
  writeInsightsRangeMode,
  type InsightsRangeMode,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

/** Insights' own Day / Week (separate from Calendar), plus the rolling Last hour. */
export function useInsightsRange() {
  const dates = useDateRange(INSIGHTS_RANGE_STORE);
  const [mode, setMode] = useState<InsightsRangeMode>(readInsightsRangeMode);

  const selectMode = (key: InsightsRangeMode) => {
    setMode(key);
    if (key === "lastHour") writeInsightsRangeMode(key);
    else dates.selectMode(key);
  };

  const goToDay = (dayMs: number) => {
    if (mode === "lastHour") selectMode("day");
    dates.goToDay(dayMs);
  };

  const shared = {
    mode,
    nowMs: dates.nowMs,
    nowSec: dates.nowSec,
    earliestSec: dates.earliestSec,
    selectMode,
    step: dates.step,
    goToday: dates.goToday,
    goToDay,
  };

  if (mode === "lastHour") {
    const period = lastHourPeriod(dates.nowSec);
    return {
      ...shared,
      columns: [lastHourColumn(dates.nowSec)],
      from: period.from,
      to: period.to,
      canGoBack: false,
      isNow: true,
      title: lastHourSpanLabel(dates.nowSec),
      live: true,
    };
  }

  return {
    ...shared,
    columns: dates.columns,
    from: dates.from,
    to: dates.to,
    canGoBack: dates.canGoBack,
    isNow: dates.isNow,
    title: dates.title,
    live: false,
  };
}
