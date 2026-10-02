import { useMemo, useState } from "react";
import { HISTORY_WINDOW_DAYS } from "../context/DashboardDataContext";
import {
  CALENDAR_RANGE_STORE,
  insightColumns,
  MODE_DAYS,
  stepColumns,
  type RangeModeKey,
  type RangeModeStore,
} from "../lib/insights";
import { formatRangeDay, historyStartSec, shiftDayMs } from "../lib/time";
import { useCurrentTime } from "./useCurrentTime";

/** Day / Week range state plus Earlier / Later / Today paging. Calendar and
 * Insights each pass their own store, but share this so paging guards cannot
 * drift. */
export function useDateRange(store: RangeModeStore = CALENDAR_RANGE_STORE) {
  const [mode, setMode] = useState(store.read);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const nowMs = useCurrentTime();

  const columns = useMemo(
    () => insightColumns(mode, anchorMs, nowMs),
    [mode, anchorMs, nowMs],
  );
  const from = columns[0].from;
  const to = columns[columns.length - 1].to;
  const nowSec = Math.floor(nowMs / 1000);
  const earliestSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const canGoBack =
    stepColumns(mode, anchorMs, -1, nowMs)[0].from >= earliestSec;
  const isNow = nowSec >= from && nowSec < to;
  const lastColumn = columns[columns.length - 1];
  const title =
    columns.length === 1
      ? formatRangeDay(from)
      : `${formatRangeDay(from)} – ${formatRangeDay(lastColumn.from)}`;

  const selectMode = (key: RangeModeKey) => {
    setMode(key);
    store.write(key);
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
    earliestSec,
    canGoBack,
    isNow,
    title,
    selectMode,
    step,
    goToday: () => setAnchorMs(Date.now()),
    goToDay: (dayMs: number) => setAnchorMs(dayMs),
  };
}
