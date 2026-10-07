import { createPortal } from "react-dom";
import { DayCalendar, type DayPickerProps } from "./DayPicker";
import { ViewToggle } from "./ViewToggle";
import {
  CALENDAR_PRESENTATIONS,
  CALENDAR_RANGE_MODES,
  type CalendarPresentation,
  type CalendarRangeMode,
} from "../lib/insights";
import { startOfDayMs, shiftDayMs } from "../lib/time";

export function DateRangeSidebar({
  target,
  range,
  presentation,
  onPresentation,
  onMode,
  onPick,
  markedDays,
}: {
  target: HTMLElement | null;
  range: {
    mode: CalendarRangeMode;
    from: number;
    to: number;
    earliestSec: number;
    nowMs: number;
    live: boolean;
    isNow: boolean;
  };
  presentation: CalendarPresentation;
  onPresentation: (presentation: CalendarPresentation) => void;
  onMode: (mode: CalendarRangeMode) => void;
  onPick: DayPickerProps["onPick"];
  markedDays?: ReadonlySet<number>;
}) {
  if (!target) return null;
  const todayMs = startOfDayMs(range.nowMs / 1000);
  const selected = range.live
    ? { from: startOfDayMs(range.from) / 1000, to: shiftDayMs(todayMs, 1) / 1000 }
    : { from: range.from, to: range.to };
  return createPortal(<>
    <h2 className="section-sidebar__title">Calendar</h2>
    <ViewToggle
      value={presentation}
      options={CALENDAR_PRESENTATIONS}
      label="Calendar presentation"
      onChange={onPresentation}
    />
    <div className="range-sidebar__dates">
      {presentation === "calendar" && (
        <ViewToggle
          value={range.mode}
          options={CALENDAR_RANGE_MODES}
          label="Calendar range"
          onChange={onMode}
        />
      )}
      <div className={`range-sidebar__month${range.live ? " range-sidebar__month--live" : ""}`}>
        <DayCalendar earliestSec={range.earliestSec} nowMs={range.nowMs} selected={selected} onPick={onPick} markedDays={markedDays} />
      </div>
    </div>
  </>, target);
}
