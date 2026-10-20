// Behavior and invariants: docs/interface/calendar.md#presentation-and-range
import { useCallback, useState } from "react";
import {
  readRecapDateRangeMode,
  writeRecapDateRangeMode,
  type RecapPresentation,
  type RangeModeKey,
} from "../lib/insights";
import { useDateRange } from "./useDateRange";

/** The Recap Section's date range. Day / Week belongs to Calendar; Timeline
 * always reads the selected day and leaves Calendar's choice stored, so
 * returning to Calendar reopens the week that contains that day. */
export function useRecapDateRange(presentation: RecapPresentation) {
  const [calendarMode, setMode] = useState<RangeModeKey>(() =>
    readRecapDateRangeMode(),
  );
  const mode = presentation === "timeline" ? "day" : calendarMode;
  const dates = useDateRange(mode);

  const selectMode = useCallback(
    (key: RangeModeKey) => {
      // Timeline's Day is a readout; pressing it must keep Calendar's stored Week.
      if (presentation === "timeline") return;
      setMode(key);
      writeRecapDateRangeMode(key);
    },
    [presentation],
  );

  return {
    mode,
    columns: dates.columns,
    from: dates.from,
    to: dates.to,
    nowMs: dates.nowMs,
    nowSec: dates.nowSec,
    canGoBack: dates.canGoBack,
    isNow: dates.isNow,
    title: dates.title,
    selectMode,
    step: dates.step,
    goToday: dates.goToday,
    picker: dates.picker,
  };
}
