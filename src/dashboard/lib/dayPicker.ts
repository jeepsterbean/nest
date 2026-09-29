import { shiftDayMs, startOfDayMs } from "./time";

export type DayPickerCell = {
  dayMs: number;
  dayOfMonth: number;
  inMonth: boolean;
  isToday: boolean;
  isSelected: boolean;
  /** Inside the loaded history and not in the future. */
  isPickable: boolean;
};

export type DayPickerBounds = {
  earliestSec: number;
  nowMs: number;
  /** The range on screen, half-open unix seconds. */
  selected: { from: number; to: number };
};

export const startOfMonthMs = (dayMs: number) => {
  const d = new Date(dayMs);
  return new Date(d.getFullYear(), d.getMonth(), 1).getTime();
};

export const shiftMonthMs = (monthMs: number, months: number) => {
  const d = new Date(monthMs);
  return new Date(d.getFullYear(), d.getMonth() + months, 1).getTime();
};

export const monthTitle = (monthMs: number) =>
  new Date(monthMs).toLocaleDateString(undefined, {
    month: "long",
    year: "numeric",
  });

/** Monday-first weekday initials, from a known Monday so the locale names them. */
export const WEEKDAY_INITIALS = Array.from({ length: 7 }, (_, index) =>
  new Date(2024, 0, 1 + index).toLocaleDateString(undefined, {
    weekday: "narrow",
  }),
);

/** Whole Monday-first weeks covering the month of `monthMs`. */
export const dayPickerWeeks = (
  monthMs: number,
  { earliestSec, nowMs, selected }: DayPickerBounds,
): DayPickerCell[][] => {
  const month = new Date(monthMs).getMonth();
  const first = startOfMonthMs(monthMs);
  const gridStart = shiftDayMs(first, -((new Date(first).getDay() + 6) % 7));
  const nextMonth = shiftMonthMs(first, 1);
  const today = startOfDayMs(nowMs / 1000);
  const earliestDay = startOfDayMs(earliestSec);

  const weeks: DayPickerCell[][] = [];
  for (let weekStart = gridStart; weekStart < nextMonth; ) {
    const week = Array.from({ length: 7 }, (_, index) => {
      const dayMs = shiftDayMs(weekStart, index);
      const daySec = Math.floor(dayMs / 1000);
      return {
        dayMs,
        dayOfMonth: new Date(dayMs).getDate(),
        inMonth: new Date(dayMs).getMonth() === month,
        isToday: dayMs === today,
        isSelected: daySec >= selected.from && daySec < selected.to,
        isPickable: dayMs >= earliestDay && dayMs <= today,
      };
    });
    weeks.push(week);
    weekStart = shiftDayMs(weekStart, 7);
  }
  return weeks;
};

export const canShowEarlierMonth = (monthMs: number, earliestSec: number) =>
  startOfMonthMs(monthMs) > startOfMonthMs(earliestSec * 1000);

export const canShowLaterMonth = (monthMs: number, nowMs: number) =>
  startOfMonthMs(monthMs) < startOfMonthMs(nowMs);
