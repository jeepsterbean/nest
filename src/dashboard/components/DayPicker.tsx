import { useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import {
  canShowEarlierMonth,
  canShowLaterMonth,
  dayPickerWeeks,
  monthTitle,
  shiftMonthMs,
  startOfMonthMs,
  WEEKDAY_INITIALS,
  type DayPickerBounds,
} from "../lib/dayPicker";

import { shiftDayMs, startOfDayMs } from "../lib/time";

export type DayPickerProps = DayPickerBounds & {
  onPick: (dayMs: number) => void;
  /** Day starts that hold entries, marked with a dot. */
  markedDays?: ReadonlySet<number>;
};

const dayName = (dayMs: number) =>
  new Date(dayMs).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });

export function DayCalendar({ earliestSec, nowMs, selected, onPick, markedDays }: DayPickerProps) {
  const selectedMonthMs = startOfMonthMs(selected.from * 1000);
  const [browsedMonth, setBrowsedMonth] = useState({ selectedFrom: selected.from, monthMs: selectedMonthMs });
  const monthMs = browsedMonth.selectedFrom === selected.from ? browsedMonth.monthMs : selectedMonthMs;
  const setMonthMs = (next: number) => setBrowsedMonth({ selectedFrom: selected.from, monthMs: next });
  const weeks = dayPickerWeeks(monthMs, { earliestSec, nowMs, selected });
  const [focusedDay, setFocusedDay] = useState<number | null>(null);
  const pendingFocus = useRef<number | null>(null);
  const dateButtons = useRef(new Map<number, HTMLButtonElement>());
  const pickableCells = weeks.flat().filter((cell) => cell.isPickable);
  const tabDay = pickableCells.find((cell) => cell.dayMs === focusedDay)?.dayMs
    ?? pickableCells.find((cell) => cell.isSelected)?.dayMs
    ?? pickableCells.find((cell) => cell.isToday)?.dayMs
    ?? pickableCells[0]?.dayMs;
  useEffect(() => {
    if (pendingFocus.current === null) return;
    dateButtons.current.get(pendingFocus.current)?.focus();
    pendingFocus.current = null;
  });
  const moveFocus = (dayMs: number, key: string) => {
    const weekday = (new Date(dayMs).getDay() + 6) % 7;
    const offset = key === "ArrowLeft" ? -1 : key === "ArrowRight" ? 1
      : key === "ArrowUp" ? -7 : key === "ArrowDown" ? 7
      : key === "Home" ? -weekday : key === "End" ? 6 - weekday : null;
    if (offset === null) return false;
    const next = Math.max(startOfDayMs(earliestSec),
      Math.min(startOfDayMs(nowMs / 1000), shiftDayMs(dayMs, offset)));
    setFocusedDay(next);
    setMonthMs(startOfMonthMs(next));
    pendingFocus.current = next;
    return true;
  };
  return (
    <div className="day-calendar">
      <header className="day-picker__head">
        <button
          type="button"
          aria-label="Earlier month"
          disabled={!canShowEarlierMonth(monthMs, earliestSec)}
          onClick={() => setMonthMs(shiftMonthMs(monthMs, -1))}
        >
          <ChevronLeft />
        </button>
        <span aria-live="polite">{monthTitle(monthMs)}</span>
        <button
          type="button"
          aria-label="Later month"
          disabled={!canShowLaterMonth(monthMs, nowMs)}
          onClick={() => setMonthMs(shiftMonthMs(monthMs, 1))}
        >
          <ChevronRight />
        </button>
      </header>
      <div className="day-picker__grid" role="grid" aria-label={monthTitle(monthMs)}>
        <div className="day-picker__week" role="row">
          {WEEKDAY_INITIALS.map((initial, index) => (
            <span
              key={index}
              className="day-picker__weekday"
              role="columnheader"
              aria-hidden="true"
            >
              {initial}
            </span>
          ))}
        </div>
        {weeks.map((week) => (
          <div key={week[0].dayMs} className="day-picker__week" role="row">
            {week.map((cell) => (
              <button
                key={cell.dayMs}
                type="button"
                role="gridcell"
                tabIndex={cell.dayMs === tabDay ? 0 : -1}
                ref={(button) => {
                  if (button) dateButtons.current.set(cell.dayMs, button);
                  else dateButtons.current.delete(cell.dayMs);
                }}
                onFocus={() => setFocusedDay(cell.dayMs)}
                onKeyDown={(event) => {
                  if (event.altKey || event.ctrlKey || event.metaKey || event.shiftKey) return;
                  if (moveFocus(cell.dayMs, event.key)) event.preventDefault();
                }}
                className={[
                  "day-picker__day",
                  cell.inMonth ? "" : "is-outside",
                  cell.isToday ? "is-today" : "",
                  cell.isSelected ? "is-selected" : "",
                  markedDays?.has(cell.dayMs) ? "has-entries" : "",
                ]
                  .filter(Boolean)
                  .join(" ")}
                aria-label={
                  markedDays?.has(cell.dayMs)
                    ? `${dayName(cell.dayMs)}, has entries`
                    : dayName(cell.dayMs)
                }
                aria-selected={cell.isSelected}
                disabled={!cell.isPickable}
                onClick={() => {
                  onPick(cell.dayMs);
                }}
              >
                {cell.dayOfMonth}
              </button>
            ))}
          </div>
        ))}
      </div>
    </div>
  );
}
