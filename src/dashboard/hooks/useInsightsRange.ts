import { useState } from "react";
import {
  lastHourColumn,
  lastHourPeriod,
  readInsightsRangeMode,
  writeInsightsRangeMode,
  type InsightsRangeMode,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

/** Insights Day / Week follow the shared Calendar range. Last hour is Insights-only. */
export function useInsightsRange() {
  const calendar = useDateRange();
  const [mode, setMode] = useState<InsightsRangeMode>(readInsightsRangeMode);

  const selectMode = (key: InsightsRangeMode) => {
    writeInsightsRangeMode(key);
    setMode(key);
    if (key !== "lastHour") calendar.selectMode(key);
  };

  if (mode === "lastHour") {
    const period = lastHourPeriod(calendar.nowSec);
    return {
      mode,
      columns: [lastHourColumn(calendar.nowSec)],
      from: period.from,
      to: period.to,
      nowMs: calendar.nowMs,
      nowSec: calendar.nowSec,
      canGoBack: false,
      isNow: true,
      title: "Last hour",
      paging: false,
      selectMode,
      step: calendar.step,
      goToday: calendar.goToday,
    };
  }

  return {
    mode,
    columns: calendar.columns,
    from: calendar.from,
    to: calendar.to,
    nowMs: calendar.nowMs,
    nowSec: calendar.nowSec,
    canGoBack: calendar.canGoBack,
    isNow: calendar.isNow,
    title: calendar.title,
    paging: true,
    selectMode,
    step: calendar.step,
    goToday: calendar.goToday,
  };
}
