// Behavior and invariants: docs/calendar.md#range-sidebar
import { useCallback, useMemo, useRef, useState } from "react";
import { HISTORY_WINDOW_DAYS } from "../context/DashboardDataContext";
import {
  insightColumns,
  MODE_DAYS,
  stepColumns,
  type RangeModeKey,
} from "../lib/insights";
import { formatRangeDate, formatRangeDay, historyStartSec, startOfDayMs } from "../lib/time";
import { boundedDayMs, selectedDayMs, stepSelectedDay } from "../lib/dateNavigation";
import { useCurrentTime } from "./useCurrentTime";

/** Date paging is independent of persisted presentation mode. */
export function useDateRange(mode: RangeModeKey) {
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const nowMs = useCurrentTime();
  // Read the clock through a ref so `step` keeps one identity across ticks and
  // keyboard listeners that depend on it are not re-registered each minute.
  const nowMsRef = useRef(nowMs);
  nowMsRef.current = nowMs;

  const effectiveAnchorMs = selectedDayMs(anchorMs, nowMs);
  const columns = useMemo(
    () => insightColumns(mode, effectiveAnchorMs, nowMs),
    [mode, effectiveAnchorMs, nowMs],
  );
  const from = columns[0].from;
  const to = columns[columns.length - 1].to;
  const nowSec = Math.floor(nowMs / 1000);
  const earliestSec = historyStartSec(nowMs, HISTORY_WINDOW_DAYS);
  const canGoBack =
    stepColumns(mode, effectiveAnchorMs, -1, nowMs)[0].from >= earliestSec;
  const isNow = nowSec >= from && nowSec < to;
  const lastColumn = columns[columns.length - 1];
  const title =
    columns.length === 1
      ? formatRangeDay(from)
      : `${formatRangeDate(from)} – ${formatRangeDate(lastColumn.from)}`;

  const step = useCallback((direction: number) => {
    setAnchorMs((current) => {
      const now = nowMsRef.current;
      const earliest = historyStartSec(now, HISTORY_WINDOW_DAYS);
      if (stepColumns(mode, selectedDayMs(current, now), direction, now)[0].from < earliest) return current;
      return stepSelectedDay(current, direction * MODE_DAYS[mode], now);
    });
  }, [mode]);
  const goToday = useCallback(() => setAnchorMs(null), []);
  const goToDay = useCallback((dayMs: number) => {
    const bounded = boundedDayMs(dayMs, nowMs, earliestSec);
    setAnchorMs(bounded === startOfDayMs(nowMs / 1000) ? null : bounded);
  }, [nowMs, earliestSec]);

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
