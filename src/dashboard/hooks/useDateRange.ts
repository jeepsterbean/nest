import { useCallback, useMemo, useState } from "react";
import { HISTORY_WINDOW_DAYS } from "../context/DashboardDataContext";
import {
  insightColumns,
  MODE_DAYS,
  stepColumns,
  type RangeModeKey,
} from "../lib/insights";
import { formatRangeDate, formatRangeDay, historyStartSec, shiftDayMs } from "../lib/time";
import { useCurrentTime } from "./useCurrentTime";

/** Date paging is independent of persisted presentation mode. */
export function useDateRange(mode: RangeModeKey) {
  const [anchorMs, setAnchorMs] = useState(Date.now);
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
      : `${formatRangeDate(from)} – ${formatRangeDate(lastColumn.from)}`;

  const step = useCallback((direction: number) => {
    setAnchorMs((current) => shiftDayMs(current, direction * MODE_DAYS[mode]));
  }, [mode]);
  const goToday = useCallback(() => setAnchorMs(Date.now()), []);
  const goToDay = useCallback((dayMs: number) => setAnchorMs(dayMs), []);

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
    step,
    goToday,
    goToDay,
  };
}
