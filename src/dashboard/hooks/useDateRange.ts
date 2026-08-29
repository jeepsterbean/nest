import { useEffect, useMemo, useState } from "react";
import { HISTORY_WINDOW_SECONDS } from "../context/DashboardDataContext";
import {
  insightColumns,
  MODE_DAYS,
  readRangeMode,
  stepColumns,
  writeRangeMode,
  type RangeModeKey,
} from "../lib/insights";
import { shiftDayMs } from "../lib/time";

/** Day / Week range state plus Earlier / Later / Today paging. Shared by Calendar
 * and Insights so the stored range and paging guards cannot drift. */
export function useDateRange() {
  const [mode, setMode] = useState(readRangeMode);
  const [anchorMs, setAnchorMs] = useState(() => Date.now());
  const [nowMs, setNowMs] = useState(() => Date.now());

  useEffect(() => {
    const id = setInterval(() => setNowMs(Date.now()), 60_000);
    return () => clearInterval(id);
  }, []);

  const columns = useMemo(
    () => insightColumns(mode, anchorMs, nowMs),
    [mode, anchorMs, nowMs],
  );
  const from = columns[0].from;
  const to = columns[columns.length - 1].to;
  const nowSec = Math.floor(nowMs / 1000);
  const canGoBack =
    stepColumns(mode, anchorMs, -1, nowMs)[0].from >=
    nowSec - HISTORY_WINDOW_SECONDS;
  const isNow = nowSec >= from && nowSec < to;
  const title =
    columns.length === 1
      ? columns[0].label
      : `${columns[0].label} – ${columns[columns.length - 1].label}`;

  const selectMode = (key: RangeModeKey) => {
    setMode(key);
    writeRangeMode(key);
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
    canGoBack,
    isNow,
    title,
    selectMode,
    step,
    goToday: () => setAnchorMs(Date.now()),
  };
}
