import type {
  TaskStatus,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../lib/types";
import { taskStatusAt } from "./period";
import { shiftDayMs } from "./time";

export type TaskDaySummary = {
  created: number;
  completed: number;
  cancelled: number;
  incomplete: number;
  workedOn: number;
  workedSeconds: number;
};

export type TaskDayStatusRow = {
  taskId: number;
  at: number;
};

export type TaskDayWorkedRow = {
  taskId: number;
  seconds: number;
};

export type TaskDay = {
  summary: TaskDaySummary;
  created: TaskDayStatusRow[];
  completed: TaskDayStatusRow[];
  cancelled: TaskDayStatusRow[];
  incomplete: TaskDayWorkedRow[];
  worked: TaskDayWorkedRow[];
};

const latestTaskRows = (
  events: TaskStatusEvent[],
  matches: (event: TaskStatusEvent) => boolean,
): TaskDayStatusRow[] => {
  const taskIds = new Set<number>();
  return [...events]
    .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
    .filter((event) => {
      if (!matches(event) || taskIds.has(event.taskId)) return false;
      taskIds.add(event.taskId);
      return true;
    })
    .map((event) => ({ taskId: event.taskId, at: event.createdAt }));
};

export function buildTaskDay(
  dayMs: number,
  nowMs: number,
  tasks: readonly { id: number; status: TaskStatus }[],
  statusEvents: TaskStatusEvent[],
  workStretches: TaskWorkStretch[],
): TaskDay {
  const from = Math.floor(dayMs / 1000);
  const to = Math.min(
    Math.floor(shiftDayMs(dayMs, 1) / 1000),
    Math.floor(nowMs / 1000),
  );
  const dayStatusEvents = statusEvents.filter(
    (event) => event.createdAt >= from && event.createdAt < to,
  );
  const overlappingStretches = workStretches.filter((stretch) => {
    const end = stretch.endedAt ?? to;
    return stretch.startedAt < to && end > from;
  });
  const created = latestTaskRows(
    dayStatusEvents,
    (event) => event.fromStatus === null,
  );
  const tasksById = new Map(tasks.map((task) => [task.id, task]));
  const taskStatusAtEnd = (taskId: number): TaskStatus | null => {
    const task = tasksById.get(taskId);
    return task ? taskStatusAt(task, statusEvents, to) : null;
  };
  const completed = latestTaskRows(
    dayStatusEvents,
    (event) => event.toStatus === "completed",
  ).filter((row) => taskStatusAtEnd(row.taskId) === "completed");
  const cancelled = latestTaskRows(
    dayStatusEvents,
    (event) => event.toStatus === "cancelled",
  ).filter((row) => taskStatusAtEnd(row.taskId) === "cancelled");
  const workedSecondsByTask = new Map<number, number>();
  for (const stretch of overlappingStretches) {
    const startedAt = Math.max(stretch.startedAt, from);
    const endedAt = Math.min(stretch.endedAt ?? to, to);
    workedSecondsByTask.set(
      stretch.taskId,
      (workedSecondsByTask.get(stretch.taskId) ?? 0) +
        Math.max(0, endedAt - startedAt),
    );
  }
  const worked = [...workedSecondsByTask]
    .map(([taskId, seconds]) => ({ taskId, seconds }))
    .sort((a, b) => b.seconds - a.seconds || a.taskId - b.taskId);
  const incomplete = worked.filter((row) => {
    const status = taskStatusAtEnd(row.taskId);
    return status !== null && status !== "completed" && status !== "cancelled";
  });
  const workedSeconds = worked.reduce((total, row) => total + row.seconds, 0);

  return {
    created,
    completed,
    cancelled,
    incomplete,
    worked,
    summary: {
      created: created.length,
      completed: completed.length,
      cancelled: cancelled.length,
      incomplete: incomplete.length,
      workedOn: worked.length,
      workedSeconds,
    },
  };
}
