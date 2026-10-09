// Behavior and invariants: docs/time-surfaces.md#dates-and-ranges
import { shiftDayMs, startOfDayMs } from "./time";

export function boundedDayMs(dayMs: number, nowMs: number, earliestSec?: number) {
  const todayMs = startOfDayMs(nowMs / 1000);
  const bounded = Math.min(startOfDayMs(dayMs / 1000), todayMs);
  return earliestSec === undefined ? bounded : Math.max(startOfDayMs(earliestSec), bounded);
}

/** A null anchor follows Today; historical selections keep their calendar date. */
export function selectedDayMs(anchorMs: number | null, nowMs: number) {
  return boundedDayMs(anchorMs ?? nowMs, nowMs);
}

export function stepSelectedDay(anchorMs: number | null, days: number, nowMs: number) {
  const next = boundedDayMs(shiftDayMs(selectedDayMs(anchorMs, nowMs), days), nowMs);
  return next === startOfDayMs(nowMs / 1000) ? null : next;
}
