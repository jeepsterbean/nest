// Pure time/date helpers shared across the dashboard and check-in popup.
// `dayLabel` and `computeStreak` accept an injectable `nowMs` so they can be
// tested deterministically; callers default it to the current clock.

export const startOfDayMs = (tsSecs: number) => {
  const d = new Date(tsSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const previousDayMs = (dayMs: number) => {
  const d = new Date(dayMs);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

export const dayLabel = (tsSecs: number, nowMs: number = Date.now()) => {
  const day = startOfDayMs(tsSecs);
  const today = startOfDayMs(nowMs / 1000);
  if (day === today) return "Today";
  if (day === previousDayMs(today)) return "Yesterday";
  return new Date(tsSecs * 1000).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

// Days in a row with at least one entry. Today not having one yet doesn't
// break the streak — it just isn't counted.
export const computeStreak = (
  eventTimes: number[],
  nowMs: number = Date.now(),
) => {
  const days = new Set(eventTimes.map(startOfDayMs));
  let cursor = startOfDayMs(nowMs / 1000);
  if (!days.has(cursor)) cursor = previousDayMs(cursor);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayMs(cursor);
  }
  return streak;
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

export const formatDate = (ts: number | null) =>
  ts === null
    ? "—"
    : new Date(ts * 1000).toLocaleDateString(undefined, {
        month: "short",
        day: "numeric",
      });

export const formatDateTime = (ts: number) =>
  new Date(ts * 1000).toLocaleString(undefined, {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

export const elapsedMinutes = (startedAt: number, nowMs: number = Date.now()) =>
  Math.max(0, Math.floor((nowMs / 1000 - startedAt) / 60));

export const formatElapsedMinutes = (
  startedAt: number,
  nowMs: number = Date.now(),
) => `${elapsedMinutes(startedAt, nowMs)} min`;

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

export const checkInRemainingSeconds = (
  nextDueAt: number,
  nowMs: number = Date.now(),
) => Math.max(0, Math.ceil(nextDueAt - nowMs / 1000));

export const formatCheckInCountdown = (
  nextDueAt: number,
  nowMs: number = Date.now(),
) => {
  const secondsRemaining = checkInRemainingSeconds(nextDueAt, nowMs);
  const minutes = Math.floor(secondsRemaining / 60);
  const seconds = secondsRemaining % 60;
  return `${minutes}:${String(seconds).padStart(2, "0")}`;
};
