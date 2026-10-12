// Behavior and invariants: docs/interface/calendar.md#range-sidebar
import { useCallback, useState } from "react";
import {
  readRecapDateRangeMode,
  writeRecapDateRangeMode,
  type RecapDateRangeStore,
  type RecapPresentation,
  type RangeModeKey,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

const recapDateRangeStore: RecapDateRangeStore = {
  read: () => readRecapDateRangeMode(),
  write: (mode) => writeRecapDateRangeMode(mode),
};

/** The Recap Section's date range. Day / Week belongs to Calendar; Timeline
 * always reads the selected day and leaves Calendar's choice stored, so
 * returning to Calendar reopens the week that contains that day. */
export function useRecapDateRange(
  presentation: RecapPresentation,
  store: RecapDateRangeStore = recapDateRangeStore,
) {
  const [calendarMode, setMode] = useState<RangeModeKey>(() => store.read());
  const mode = presentation === "timeline" ? "day" : calendarMode;
  const dates = useDateRange(mode);

  const selectMode = useCallback(
    (key: RangeModeKey) => {
      setMode(key);
      store.write(key);
    },
    [store],
  );

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
    title: dates.title,
    selectMode,
    step: dates.step,
    goToday: dates.goToday,
    goToDay: dates.goToDay,
  };
}
