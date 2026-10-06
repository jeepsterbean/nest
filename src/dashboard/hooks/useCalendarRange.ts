import { useMemo, useState } from "react";
import {
  insightColumns,
  lastHourPeriod,
  lastHourSpanLabel,
  readCalendarRangeMode,
  writeCalendarRangeMode,
  type CalendarRangeMode,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

/** Calendar's Day / Week paging plus the rolling Last hour. `columns` is what
 * the grid draws; `from` / `to` is what Insights summarizes. Last hour draws
 * today's Day and marks its trailing hour as `span`. */
export function useCalendarRange() {
  const dates = useDateRange();
  const [mode, setMode] = useState<CalendarRangeMode>(readCalendarRangeMode);
  const liveColumns = useMemo(
    () => insightColumns("day", dates.nowMs, dates.nowMs),
    [dates.nowMs],
  );

  const selectMode = (key: CalendarRangeMode) => {
    setMode(key);
    if (key === "lastHour") {
      dates.selectMode("day");
      dates.goToday();
      writeCalendarRangeMode(key);
    } else {
      if (mode === "lastHour") dates.goToday();
      dates.selectMode(key);
    }
  };

  const goToDay = (dayMs: number) => {
    if (mode === "lastHour") selectMode("day");
    dates.goToDay(dayMs);
  };

  const shared = {
    mode,
    gridMode: mode === "week" ? ("week" as const) : ("day" as const),
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
      columns: liveColumns,
      from: period.from,
      to: period.to,
      span: period,
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
    span: null,
    canGoBack: dates.canGoBack,
    isNow: dates.isNow,
    title: dates.title,
    live: false,
  };
}
