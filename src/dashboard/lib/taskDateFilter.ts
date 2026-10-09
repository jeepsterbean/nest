import { shiftDayMs, startOfDayMs, toDateInput } from "./time";

export const TASK_DATE_PRESETS = [
  { key: "today", label: "Today" },
  { key: "this_week", label: "This week" },
  { key: "this_month", label: "This month" },
  { key: "last_7", label: "Last 7 days" },
  { key: "last_30", label: "Last 30 days" },
] as const;

export type TaskDatePreset = (typeof TASK_DATE_PRESETS)[number]["key"];

export type TaskDateFilter =
  | { kind: "preset"; preset: TaskDatePreset }
  | { kind: "range"; fromDay: string | null; toDay: string | null }
  | null;

export type TaskDateWindow = {
  fromSec: number | null;
  toSec: number | null;
};

const DAY_INPUT = /^(\d{4})-(\d{2})-(\d{2})$/;

const toSec = (ms: number) => Math.floor(ms / 1000);

/** Monday-first, matching Calendar week columns. */
const startOfWeekMs = (dayMs: number) =>
  shiftDayMs(dayMs, -((new Date(dayMs).getDay() + 6) % 7));

const startOfMonthMs = (dayMs: number) => {
  const day = new Date(dayMs);
  return new Date(day.getFullYear(), day.getMonth(), 1).getTime();
};

const startOfInputDaySec = (day: string): number | null => {
  const match = DAY_INPUT.exec(day);
  if (!match) return null;
  const year = Number(match[1]);
  const month = Number(match[2]);
  const date = Number(match[3]);
  const start = new Date(year, month - 1, date);
  // Rolled dates (Feb 31) are incomplete, not a later day.
  if (
    start.getFullYear() !== year ||
    start.getMonth() !== month - 1 ||
    start.getDate() !== date
  ) {
    return null;
  }
  return toSec(start.getTime());
};

const exclusiveEndSec = (day: string): number | null => {
  const start = startOfInputDaySec(day);
  return start === null ? null : toSec(shiftDayMs(start * 1000, 1));
};

const lastIncludedSec = (toSecExclusive: number) =>
  toSec(shiftDayMs(toSecExclusive * 1000, -1));

const resolvePreset = (preset: TaskDatePreset, nowMs: number): TaskDateWindow => {
  const todayMs = startOfDayMs(nowMs / 1000);
  const tomorrowMs = shiftDayMs(todayMs, 1);
  switch (preset) {
    case "today":
      return { fromSec: toSec(todayMs), toSec: toSec(tomorrowMs) };
    case "this_week": {
      const startMs = startOfWeekMs(todayMs);
      return { fromSec: toSec(startMs), toSec: toSec(shiftDayMs(startMs, 7)) };
    }
    case "this_month": {
      const startMs = startOfMonthMs(todayMs);
      const month = new Date(todayMs);
      const nextMs = new Date(month.getFullYear(), month.getMonth() + 1, 1).getTime();
      return { fromSec: toSec(startMs), toSec: toSec(nextMs) };
    }
    case "last_7":
      return { fromSec: toSec(shiftDayMs(todayMs, -6)), toSec: toSec(tomorrowMs) };
    case "last_30":
      return { fromSec: toSec(shiftDayMs(todayMs, -29)), toSec: toSec(tomorrowMs) };
  }
};

const resolveRange = (fromDay: string | null, toDay: string | null): TaskDateWindow | null => {
  let fromSec = fromDay ? startOfInputDaySec(fromDay) : null;
  let toSecExclusive = toDay ? exclusiveEndSec(toDay) : null;
  if (fromSec === null && toSecExclusive === null) return null;
  // A reversed pick still covers the days the user chose.
  if (fromSec !== null && toSecExclusive !== null && fromSec >= toSecExclusive && fromDay && toDay) {
    fromSec = startOfInputDaySec(toDay);
    toSecExclusive = exclusiveEndSec(fromDay);
  }
  return { fromSec, toSec: toSecExclusive };
};

const sameWindow = (left: TaskDateWindow, right: TaskDateWindow) =>
  left.fromSec === right.fromSec && left.toSec === right.toSec;

export const resolveTaskDateFilter = (
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): TaskDateWindow | null => {
  if (filter === null) return null;
  if (filter.kind === "preset") return resolvePreset(filter.preset, nowMs);
  return resolveRange(filter.fromDay, filter.toDay);
};

export const taskMatchesDateFilter = (
  tsSec: number,
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): boolean => {
  const window = resolveTaskDateFilter(filter, nowMs);
  if (window === null) return true;
  if (window.fromSec !== null && tsSec < window.fromSec) return false;
  if (window.toSec !== null && tsSec >= window.toSec) return false;
  return true;
};

export const matchingTaskDatePreset = (
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): TaskDatePreset | null => {
  if (filter === null) return null;
  if (filter.kind === "preset") return filter.preset;
  const window = resolveRange(filter.fromDay, filter.toDay);
  if (window === null || window.fromSec === null || window.toSec === null) return null;
  return (
    TASK_DATE_PRESETS.find(({ key }) => sameWindow(window, resolvePreset(key, nowMs)))?.key ??
    null
  );
};

const formatFilterDay = (tsSec: number, nowMs: number) => {
  const year = new Date(tsSec * 1000).getFullYear();
  const nowYear = new Date(nowMs).getFullYear();
  return new Date(tsSec * 1000).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    ...(year === nowYear ? {} : { year: "numeric" }),
  });
};

export const taskDateFilterLabel = (
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): string | null => {
  const preset = matchingTaskDatePreset(filter, nowMs);
  if (preset) {
    return TASK_DATE_PRESETS.find(({ key }) => key === preset)?.label ?? null;
  }
  const window = resolveTaskDateFilter(filter, nowMs);
  if (window === null) return null;
  const fromLabel =
    window.fromSec === null ? null : formatFilterDay(window.fromSec, nowMs);
  const toLabel =
    window.toSec === null ? null : formatFilterDay(lastIncludedSec(window.toSec), nowMs);
  if (fromLabel && toLabel) {
    return fromLabel === toLabel ? fromLabel : `${fromLabel} – ${toLabel}`;
  }
  if (fromLabel) return `Since ${fromLabel}`;
  if (toLabel) return `Through ${toLabel}`;
  return null;
};

/** Inclusive calendar days for the From / To fields, including a selected preset. */
export const taskDateFilterInputValues = (
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): { fromDay: string; toDay: string } => {
  const window = resolveTaskDateFilter(filter, nowMs);
  if (window === null) return { fromDay: "", toDay: "" };
  return {
    fromDay: window.fromSec === null ? "" : toDateInput(window.fromSec),
    toDay: window.toSec === null ? "" : toDateInput(lastIncludedSec(window.toSec)),
  };
};

/** Display label for a From / To field; empty when the day is unset or incomplete. */
export const formatTaskDateDay = (
  day: string,
  nowMs: number = Date.now(),
): string => {
  const start = startOfInputDaySec(day);
  return start === null ? "" : formatFilterDay(start, nowMs);
};

/** Half-open seconds the in-menu calendar should paint, or today's empty range. */
export const taskDateFilterCalendarRange = (
  filter: TaskDateFilter,
  nowMs: number = Date.now(),
): { from: number; to: number } => {
  const todaySec = toSec(startOfDayMs(nowMs / 1000));
  const window = resolveTaskDateFilter(filter, nowMs);
  if (window === null) return { from: todaySec, to: todaySec };
  if (window.fromSec !== null && window.toSec !== null) {
    return { from: window.fromSec, to: window.toSec };
  }
  if (window.fromSec !== null) {
    return { from: window.fromSec, to: toSec(shiftDayMs(window.fromSec * 1000, 1)) };
  }
  const toSecExclusive = window.toSec!;
  return { from: lastIncludedSec(toSecExclusive), to: toSecExclusive };
};
