import {
  isTaskChangeEvent,
  taskChangeTaskId,
  type TaskChangeEvent,
} from "./logs";
import type { RawLogEvent } from "./timeline";

export type HourMark =
  | { kind: "metrics"; key: string; event: Extract<RawLogEvent, { kind: "metrics" }> }
  | { kind: "dump"; key: string; event: Extract<RawLogEvent, { kind: "dump" }> }
  | { kind: "task"; key: string; taskId: number; changes: TaskChangeEvent[] };

export type LogHour = { from: number; to: number; marks: HourMark[] };

const HOUR_SECONDS = 60 * 60;

/** Hours of the day `[from, to)` that hold at least one mark, oldest first,
 * marks in time order. Phase events are skipped because the Calendar Logs grid draws
 * Phase as the wash. A Task changed several times in one hour gets one mark,
 * placed at its first change and carrying every change in order. */
export function logHours(
  events: RawLogEvent[],
  from: number,
  to: number,
): LogHour[] {
  const hours = new Map<number, LogHour>();
  const chronological = events
    .filter((event) => event.at >= from && event.at < to && event.kind !== "phase")
    .sort((a, b) => a.at - b.at);

  for (const event of chronological) {
    const hourFrom = from + Math.floor((event.at - from) / HOUR_SECONDS) * HOUR_SECONDS;
    let hour = hours.get(hourFrom);
    if (!hour) {
      hour = { from: hourFrom, to: Math.min(hourFrom + HOUR_SECONDS, to), marks: [] };
      hours.set(hourFrom, hour);
    }
    if (event.kind === "metrics") {
      hour.marks.push({ kind: "metrics", key: `metrics-${event.checkIn.id}`, event });
    } else if (event.kind === "dump") {
      hour.marks.push({ kind: "dump", key: `dump-${event.dump.id}`, event });
    } else if (isTaskChangeEvent(event)) {
      const taskId = taskChangeTaskId(event);
      const existing = hour.marks.find(
        (mark) => mark.kind === "task" && mark.taskId === taskId,
      );
      if (existing?.kind === "task") existing.changes.push(event);
      else {
        hour.marks.push({
          kind: "task",
          key: `task-${taskId}-${hourFrom}`,
          taskId,
          changes: [event],
        });
      }
    }
  }
  return [...hours.values()];
}
