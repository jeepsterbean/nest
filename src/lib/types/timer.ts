export type TimerState = {
  intervalMinutes: number;
  nextDueAt: number;
  waitingForResponse: boolean;
};
