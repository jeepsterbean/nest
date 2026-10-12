// Behavior and invariants: docs/interface/time-surfaces.md#logs-kinds
import type {
  BrainDump,
  MetricCheckInWithRatings,
  PhaseCheckIn,
  Task,
  TaskWorkStretch,
  TaskStatusEvent,
} from "../../lib/types";
import { TASK_STATUS_LABEL } from "./tasks";
import { startOfDayMs } from "./time";
import {
  buildRawLog,
  collapsePhaseCheckIns,
  phaseCheckInsInRange,
  type RawLogEvent,
} from "./timeline";

export const LOG_KINDS = [
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
  { key: "tasks", label: "Tasks" },
] as const;
export type LogKindKey = (typeof LOG_KINDS)[number]["key"];

export const ALL_LOG_KINDS: LogKindKey[] = LOG_KINDS.map(({ key }) => key);

export const MIXED_LOG_EMPTY_COPY = {
  title: "Nothing here yet",
  body: "Metric check-ins, brain dumps, Phase changes, and task activity will land here.",
};

export const LOG_EMPTY_COPY: Record<LogKindKey, { title: string; body: string }> =
  {
    dumps: {
      title: "No brain dumps yet",
      body: "Capture a thought from Brain dump or the popup.",
    },
    phases: {
      title: "No Phase changes yet",
      body: "Phase checkpoints appear here as attention shifts.",
    },
    metrics: {
      title: "No Metric check-ins yet",
      body: "Press ⌘⇧E anywhere to log your first Metric check-in.",
    },
    tasks: {
      title: "No task activity yet",
      body: "Task creation, status changes, and Working now starts and stops will land here.",
    },
  };

/** Distinct local day starts of a newest-first event list, newest first. */
export const logDayKeys = (events: readonly { at: number }[]): number[] => {
  const keys: number[] = [];
  for (const event of events) {
    const key = startOfDayMs(event.at);
    if (keys[keys.length - 1] !== key) keys.push(key);
  }
  return keys;
};

/** Selected kinds, kept non-empty and in LOG_KINDS order. Shared by Insights,
 * Timeline, and Calendar's Logs figure. */
export type LogsPreferences = {
  kinds: LogKindKey[];
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = {
  kinds: ALL_LOG_KINDS,
};

type LogsStorage = Pick<Storage, "getItem" | "setItem">;

const inKindOrder = (kinds: readonly unknown[]): LogKindKey[] =>
  ALL_LOG_KINDS.filter((key) => kinds.includes(key));

/** Show or hide one kind. The last shown kind stays on so the history filter always includes a kind. */
export function toggleLogKind(
  kinds: LogKindKey[],
  key: LogKindKey,
): LogKindKey[] {
  if (!kinds.includes(key)) return inKindOrder([...kinds, key]);
  return kinds.length === 1 ? kinds : kinds.filter((kind) => kind !== key);
}

/** Storage from before multi-select (`view` + `layout`) falls back to all kinds.
 * A stored `scale` from the retired List / Hours switch is ignored. */
export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const isObject = stored !== null && typeof stored === "object";
    const kinds =
      isObject && Array.isArray(stored.kinds) ? inKindOrder(stored.kinds) : [];
    return {
      kinds: kinds.length > 0 ? kinds : DEFAULT_LOGS_PREFERENCES.kinds,
    };
  } catch {
    return DEFAULT_LOGS_PREFERENCES;
  }
}

export function writeLogsPreferences(
  preferences: LogsPreferences,
  storage: LogsStorage = localStorage,
) {
  storage.setItem(LOGS_PREFERENCES_KEY, JSON.stringify(preferences));
}

/** History events for the selected kinds. Phase rows are settled by the 60-second
 * collapse unless `everyPhaseCheckpoint` (the Phases-only raw view) is on. */
export function buildLogsEvents(
  kinds: LogKindKey[],
  everyPhaseCheckpoint: boolean,
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
  taskWorkStretches: TaskWorkStretch[],
  historyFromSec: number,
  taskStatusEvents: TaskStatusEvent[] = [],
): RawLogEvent[] {
  // Collapse runs before the range cut so a settle matching the Phase already
  // active at the window start is omitted along with that carry-in.
  const phaseRows = kinds.includes("phases")
    ? phaseCheckInsInRange(
        everyPhaseCheckpoint
          ? phaseCheckIns
          : collapsePhaseCheckIns(phaseCheckIns),
        historyFromSec,
      )
    : [];
  return buildRawLog(
    kinds.includes("metrics") ? checkIns : [],
    phaseRows,
    kinds.includes("dumps") ? brainDumps : [],
    kinds.includes("tasks") ? taskWorkStretches : [],
    kinds.includes("tasks") ? taskStatusEvents : [],
  );
}

/** Every kind with settled Phase changes, whatever the kind filter: the days
 * the Recap sidebar marks as holding history. */
export function buildLogDayMarkerEvents(
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
  taskWorkStretches: TaskWorkStretch[],
  historyFromSec: number,
  taskStatusEvents: TaskStatusEvent[] = [],
) {
  return buildLogsEvents(
    ALL_LOG_KINDS,
    false,
    checkIns,
    phaseCheckIns,
    brainDumps,
    taskWorkStretches,
    historyFromSec,
    taskStatusEvents,
  );
}

export const taskTitle = (tasks: Task[], taskId: number) =>
  tasks.find((task) => task.id === taskId)?.title ?? `Task ${taskId}`;

export function taskStatusEventLabel(event: TaskStatusEvent): string {
  const label = (status: TaskStatusEvent["toStatus"]) =>
    status === "paused" ? "Paused" : TASK_STATUS_LABEL[status];
  if (event.fromStatus === null) return `Created task · ${label(event.toStatus)}`;
  if (event.toStatus === "completed") return `Completed task · ${label(event.fromStatus)} → Completed`;
  if (event.toStatus === "cancelled") return `Cancelled task · ${label(event.fromStatus)} → Cancelled`;
  return `${label(event.fromStatus)} → ${label(event.toStatus)}`;
}

export type TaskChangeEvent = Extract<
  RawLogEvent,
  { kind: "work-start" | "work-stop" | "task-status" }
>;

export const isTaskChangeEvent = (event: RawLogEvent): event is TaskChangeEvent =>
  event.kind === "work-start" ||
  event.kind === "work-stop" ||
  event.kind === "task-status";

export const taskChangeTaskId = (event: TaskChangeEvent) =>
  event.kind === "task-status" ? event.statusEvent.taskId : event.stretch.taskId;

export function taskChangeLabel(event: TaskChangeEvent): string {
  switch (event.kind) {
    case "task-status":
      return taskStatusEventLabel(event.statusEvent);
    case "work-start":
      return "Working now started";
    case "work-stop":
      return "Paused";
  }
}
