/** Valid Timer interval picks; must match the Rust `timer` step rules. */
export const TIMER_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

export const timerRemainingSeconds = (
  nextDueAt: number,
  nowMs: number = Date.now(),
) => Math.max(0, Math.ceil(nextDueAt - nowMs / 1000));

/** Due when the Timer is paused waiting, or the countdown has hit zero. */
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

export function adjacentTimerInterval(current: number, direction: -1 | 1) {
  const currentIndex = TIMER_INTERVALS.findIndex(
    (interval) => interval === current,
  );
  const nextIndex = Math.max(
    0,
    Math.min(
      TIMER_INTERVALS.length - 1,
      (currentIndex < 0 ? 0 : currentIndex) + direction,
    ),
  );
  return TIMER_INTERVALS[nextIndex];
}
