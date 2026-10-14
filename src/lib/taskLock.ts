import type { Task } from "./types";

export const localDayStartSec = (nowMs: number): number => {
  const today = new Date(nowMs);
  today.setHours(0, 0, 0, 0);
  return Math.floor(today.getTime() / 1000);
};

/**
 * A closed Task's status can change only on the local day it closed. Locked is
 * derived from the clock each time it is asked, never stored, so it turns over
 * at midnight with nothing running and holds when Nest was shut that night.
 */
export const isTaskLocked = (
  task: Pick<Task, "status" | "closedAt">,
  nowMs: number,
): boolean => {
  if (task.status !== "completed" && task.status !== "cancelled") return false;
  // A closure with no recorded time predates status history, so it cannot be
  // today's.
  if (task.closedAt === null) return true;
  return task.closedAt < localDayStartSec(nowMs);
};
