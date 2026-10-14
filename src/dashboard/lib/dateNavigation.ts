// Behavior and invariants: docs/interface/time-surfaces.md#dates-and-ranges
import type { DayPickerProps } from "./dayPicker";
import { shiftDayMs, startOfDayMs } from "./time";

// Brain dump, Metrics, and Phases Day fetch older days on demand, so their
// date picker reaches back as far as the calendar can page.
const NO_EARLIEST_DAY_SEC = 0;

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

/** The anchor for a day picked directly: bounded, and null when it is Today. */
export function pickedDayAnchor(dayMs: number, nowMs: number, earliestSec?: number) {
  const bounded = boundedDayMs(dayMs, nowMs, earliestSec);
  return bounded === startOfDayMs(nowMs / 1000) ? null : bounded;
}

/** Date picker inputs for a surface that shows one selected day. */
export function singleDayPicker(
  dayStartMs: number,
  nowMs: number,
  onAnchor: (anchorMs: number | null) => void,
  earliestSec = NO_EARLIEST_DAY_SEC,
): DayPickerProps {
  return {
    earliestSec,
    nowMs,
    selected: { from: dayStartMs / 1000, to: shiftDayMs(dayStartMs, 1) / 1000 },
    onPick: (dayMs) => onAnchor(pickedDayAnchor(dayMs, nowMs, earliestSec)),
  };
}
