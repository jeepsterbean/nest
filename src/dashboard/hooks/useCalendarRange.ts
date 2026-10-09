// Behavior and invariants: docs/interface/calendar.md#range-sidebar
import { useMemo, useState } from "react";
import {
  insightColumns,
  lastHourPeriod,
  lastHourSpanLabel,
  readCalendarRangeMode,
  writeCalendarRangeMode,
  type CalendarRangeMode,
  type CalendarRangeStore,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

const calendarRangeStore: CalendarRangeStore = {
  read: () => readCalendarRangeMode(),
  write: (mode) => writeCalendarRangeMode(mode),
};

/** Calendar's Day / Week paging plus the rolling Last hour. `columns` is what
 * the grid draws; `from` / `to` is what Insights summarizes. Last hour draws
 * today's Day and marks its trailing hour as `span`. */
export function useCalendarRange(
  store: CalendarRangeStore = calendarRangeStore,
) {
  const [mode, setMode] = useState<CalendarRangeMode>(store.read);
  const dates = useDateRange(mode === "lastHour" ? "day" : mode);
  const liveColumns = useMemo(
    () => insightColumns("day", dates.nowMs, dates.nowMs),
    [dates.nowMs],
  );

  const selectMode = (key: CalendarRangeMode) => {
    setMode(key);
    store.write(key);
    if (key === "lastHour" || mode === "lastHour") dates.goToday();
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
