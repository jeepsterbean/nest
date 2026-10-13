import type { TaskWorkStretch } from "../../lib/types";
import type { TaskDateWindow } from "./taskDateFilter";

/** Positive overlap includes overnight work on each day it touches. */
export function taskWorkedSecondsInRange(
  stretches: TaskWorkStretch[],
  range: TaskDateWindow,
  nowMs: number,
): Map<number, number> {
  const totals = new Map<number, number>();
  const nowSec = Math.floor(nowMs / 1000);
  for (const stretch of stretches) {
    const start = Math.max(stretch.startedAt, range.fromSec ?? -Infinity);
    const end = Math.min(stretch.endedAt ?? nowSec, range.toSec ?? Infinity, nowSec);
    const seconds = end - start;
    if (seconds <= 0) continue;
    totals.set(stretch.taskId, (totals.get(stretch.taskId) ?? 0) + seconds);
  }
  return totals;
}
