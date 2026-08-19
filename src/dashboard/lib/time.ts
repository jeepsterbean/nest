// Pure time/date helpers shared across the dashboard and popup.
// `dayLabel` accepts an injectable `nowMs` so it can be tested
// deterministically; callers default it to the current clock.

export const startOfDayMs = (tsSecs: number) => {
  const d = new Date(tsSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

/** Start of the day `days` away from `dayMs`. setDate, not arithmetic, so a
 * DST day keeps its real 23 or 25 hours. */
export const shiftDayMs = (dayMs: number, days: number) => {
  const d = new Date(dayMs);
  d.setDate(d.getDate() + days);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const dayLabel = (tsSecs: number, nowMs: number = Date.now()) => {
  const day = startOfDayMs(tsSecs);
  const today = startOfDayMs(nowMs / 1000);
  if (day === today) return "Today";
  if (day === shiftDayMs(today, -1)) return "Yesterday";
  return new Date(tsSecs * 1000).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

export const greetingForHour = (hour: number) => {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

export const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

/** One Calendar drag snap step, in seconds. */
export const QUARTER_HOUR_SECONDS = 15 * 60;

/** Nearest local-time :00 / :15 / :30 / :45. Calendar drag uses this so a
 * stretch lands on a clock time, not a unix-epoch multiple of 900. */
export const snapToQuarterHour = (ts: number) => {
  const d = new Date(ts * 1000);
  const midnight = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  const step = QUARTER_HOUR_SECONDS * 1000;
  return Math.floor((midnight + Math.round((d.getTime() - midnight) / step) * step) / 1000);
};

const pad2 = (n: number) => String(n).padStart(2, "0");

/** Local YYYY-MM-DD for `<input type="date">`. */
export const toDateInput = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${d.getFullYear()}-${pad2(d.getMonth() + 1)}-${pad2(d.getDate())}`;
};

/** Local HH:MM for `<input type="time">`. */
export const toTimeInput = (ts: number) => {
  const d = new Date(ts * 1000);
  return `${pad2(d.getHours())}:${pad2(d.getMinutes())}`;
};

/** Unix seconds from local date and time field values, or null if either is incomplete. */
export const fromDateAndTime = (date: string, time: string) => {
  const day = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  const clock = /^(\d{1,2}):(\d{2})(?::(\d{2}))?$/.exec(time);
  if (!day || !clock) return null;
  const ts = new Date(
    Number(day[1]),
    Number(day[2]) - 1,
    Number(day[3]),
    Number(clock[1]),
    Number(clock[2]),
    Number(clock[3] ?? 0),
  ).getTime();
  return Number.isNaN(ts) ? null : Math.floor(ts / 1000);
};

export const formatHourTick = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, { hour: "numeric" });

/** Whole minutes and hours for duration summaries. Sub-minute spans stay "<1m". */
export const formatCompactDuration = (seconds: number) => {
  if (seconds <= 0) return "0m";
  if (seconds < 60) return "<1m";
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  if (hours > 0 && minutes > 0) return `${hours}h ${minutes}m`;
  if (hours > 0) return `${hours}h`;
  return `${minutes}m`;
};

export const formatDate = (ts: number | null) =>
  ts === null
    ? "—"
    : new Date(ts * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

export const taskWorkSessionSeconds = (
  startedAt: number | null,
  nowMs: number = Date.now(),
) =>
  startedAt === null
    ? 0
    : Math.max(0, Math.floor(nowMs / 1000) - startedAt);

export const taskTotalWorkedSeconds = (
  bankedSeconds: number,
  startedAt: number | null,
  nowMs: number = Date.now(),
) => bankedSeconds + taskWorkSessionSeconds(startedAt, nowMs);

export const formatWorkedTime = (seconds: number) => {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const remainder = seconds % 60;
  if (hours > 0) {
    return `${hours}:${String(minutes).padStart(2, "0")}:${String(remainder).padStart(2, "0")}`;
  }
  if (minutes > 0) {
    return `${minutes}:${String(remainder).padStart(2, "0")}`;
  }
  return String(remainder);
};

/** Compact play-button label: raw seconds below 1 minute, whole minutes after. */
export const formatPlayButtonTime = (seconds: number) =>
  seconds < 60 ? String(seconds) : String(Math.floor(seconds / 60));

export const timerRemainingSeconds = (
  nextDueAt: number,
  nowMs: number = Date.now(),
) => Math.max(0, Math.ceil(nextDueAt - nowMs / 1000));

/** Valid popup / header interval picks; must match Rust `timer` step rules. */
export const TIMER_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

/** Due when the timer is paused waiting, or the countdown has hit zero. */
export const isTimerDue = (
  timer: { waitingForResponse: boolean; nextDueAt: number },
  nowMs: number = Date.now(),
) =>
  timer.waitingForResponse ||
  timerRemainingSeconds(timer.nextDueAt, nowMs) === 0;

export const formatTimerCountdown = (
  nextDueAt: number,
  nowMs: number = Date.now(),
) => {
  const secondsRemaining = timerRemainingSeconds(nextDueAt, nowMs);
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
