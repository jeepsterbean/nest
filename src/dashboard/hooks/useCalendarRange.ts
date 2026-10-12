// Behavior and invariants: docs/interface/calendar.md#range-sidebar
import { useCallback, useEffect, useRef, useState } from "react";
import {
  lastHourPeriod,
  readCalendarRangeMode,
  readInsightLastHour,
  writeCalendarRangeMode,
  writeInsightLastHour,
  type CalendarRangeStore,
  type RangeModeKey,
} from "../lib/insights";
import { startOfDayMs } from "../lib/time";
import { useDateRange } from "./useDateRange";

const calendarRangeStore: CalendarRangeStore = {
  read: () => readCalendarRangeMode(),
  write: (mode) => writeCalendarRangeMode(mode),
};

/** Day / Week for the whole Calendar section. Calendar and Timeline share the
 * selected day. Last hour is an Insights window on today: choosing it lands
 * on today in Day, and leaving that day or opening Week drops it so the grid
 * and the panel stay on the same range. */
export function useCalendarRange(
  store: CalendarRangeStore = calendarRangeStore,
) {
  const [lastHour, setLastHour] = useState(readInsightLastHour);
  const [mode, setMode] = useState<RangeModeKey>(() =>
    readInsightLastHour() ? "day" : store.read(),
  );
  const dates = useDateRange(mode);
  const lastHourRef = useRef(lastHour);
  lastHourRef.current = lastHour;
  const nowMsRef = useRef(dates.nowMs);
  nowMsRef.current = dates.nowMs;

  // A stored Week must not reopen under Last hour, which is always today.
  useEffect(() => {
    if (readInsightLastHour()) store.write("day");
  }, [store]);

  const selectMode = useCallback(
    (key: RangeModeKey) => {
      if (key === "week" && lastHourRef.current) {
        setLastHour(false);
        writeInsightLastHour(false);
      }
      setMode(key);
      store.write(key);
    },
    [store],
  );

  const goToDay = useCallback(
    (dayMs: number) => {
      const today = startOfDayMs(nowMsRef.current / 1000);
      if (lastHourRef.current && startOfDayMs(dayMs / 1000) !== today) {
        setLastHour(false);
        writeInsightLastHour(false);
      }
      dates.goToDay(dayMs);
    },
    [dates.goToDay],
  );

  const step = useCallback(
    (direction: number) => {
      if (lastHourRef.current) {
        setLastHour(false);
        writeInsightLastHour(false);
      }
      dates.step(direction);
    },
    [dates.step],
  );

  const selectLastHour = useCallback(
    (on: boolean) => {
      setLastHour(on);
      writeInsightLastHour(on);
      if (!on) return;
      setMode("day");
      store.write("day");
      dates.goToday();
    },
    [store, dates.goToday],
  );

  const insight = lastHour
    ? { ...lastHourPeriod(dates.nowSec), live: true }
    : { from: dates.from, to: dates.to, live: false };

  return {
    mode,
    columns: dates.columns,
    from: dates.from,
    to: dates.to,
    nowMs: dates.nowMs,
    nowSec: dates.nowSec,
    earliestSec: dates.earliestSec,
    canGoBack: dates.canGoBack,
    isNow: dates.isNow,
    lastHour,
    insight,
    selectMode,
    selectLastHour,
    step,
    goToday: dates.goToday,
    goToDay,
  };
}
