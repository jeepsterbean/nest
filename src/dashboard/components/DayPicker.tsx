import { useEffect, useRef, useState, type ReactNode } from "react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { HISTORY_WINDOW_DAYS } from "../context/DashboardDataContext";
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

/** The range title as a button that opens a month of pickable days. */
export function DayPicker({
  label,
  earliestSec,
  nowMs,
  selected,
  onPick,
  markedDays,
  children,
}: DayPickerProps & { label: string; children: ReactNode }) {
  const [open, setOpen] = useState(false);
  const [monthMs, setMonthMs] = useState(() =>
    startOfMonthMs(selected.from * 1000),
  );
  const rootRef = useRef<HTMLSpanElement>(null);
  const triggerRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  const close = (restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    panelRef.current
      ?.querySelector<HTMLButtonElement>(
        ".day-picker__day.is-selected:not(:disabled), .day-picker__day.is-today",
      )
      ?.focus();
    const onPointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) close(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [open]);

  const toggle = () => {
    if (!open) setMonthMs(startOfMonthMs(selected.from * 1000));
    setOpen(!open);
  };

  const weeks = dayPickerWeeks(monthMs, { earliestSec, nowMs, selected });

  return (
    <span
      ref={rootRef}
      className="day-picker"
      onKeyDown={(event) => {
        if (event.key === "Escape" && open) {
          event.stopPropagation();
          close(true);
        }
      }}
    >
      <button
        ref={triggerRef}
        type="button"
        className="range-nav__title"
        aria-label={`${label}, choose a day`}
        aria-haspopup="dialog"
        aria-expanded={open}
        onClick={toggle}
      >
        {children}
      </button>
      {open ? (
        <div
          ref={panelRef}
          className="day-picker__panel"
          role="dialog"
          aria-label="Choose a day"
        >
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
          <div className="day-picker__grid" role="grid">
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
                      close(true);
                    }}
                  >
                    {cell.dayOfMonth}
                  </button>
                ))}
              </div>
            ))}
          </div>
          <p className="day-picker__note">
            History reaches back {HISTORY_WINDOW_DAYS} days.
          </p>
        </div>
      ) : null}
    </span>
  );
}
