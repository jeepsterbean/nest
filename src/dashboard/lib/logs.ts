import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  TaskWorkStretch,
  TaskStatusEvent,
} from "../../lib/types";
import { brainDumpPlainTextLines } from "../../lib/brainDumpRichText";
import { TASK_STATUS_LABEL } from "./tasks";
import { phaseName } from "./period";
import { formatTime, startOfDayMs, toDateInput } from "./time";
import { CALENDAR_RANGE_MODES, type CalendarRangeStore } from "./insights";
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
      body: "Capture a thought from Overview or the popup.",
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

export const LOGS_CALENDAR_RANGE_STORE: CalendarRangeStore = {
  read: () => CALENDAR_RANGE_MODES.find((mode) => mode.key === localStorage.getItem("nest:logs-range"))?.key ?? "day",
  write: (mode) => localStorage.setItem("nest:logs-range", mode),
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

/** Selected kinds, kept non-empty and in LOG_KINDS order. Shared by Timeline
 * and Calendar's Logs figure. */
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

/** Single click. The last selected kind stays on so the history filter always includes a kind. */
export function toggleLogKind(
  kinds: LogKindKey[],
  key: LogKindKey,
): LogKindKey[] {
  if (!kinds.includes(key)) return inKindOrder([...kinds, key]);
  return kinds.length === 1 ? kinds : kinds.filter((kind) => kind !== key);
}

/** Double click isolates a kind; isolating the one already alone restores all. */
export function soloLogKind(
  kinds: LogKindKey[],
  key: LogKindKey,
): LogKindKey[] {
  return kinds.length === 1 && kinds[0] === key ? ALL_LOG_KINDS : [key];
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

/** Day export feed: happenings plus settled Phase changes. */
export function buildLogExportEvents(
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

type LogExportContext = {
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
};

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
      return "Working now stopped";
  }
}

function eventMarkdown(event: RawLogEvent, context: LogExportContext) {
  const time = formatTime(event.at);
  switch (event.kind) {
    case "phase":
      return `- ${time} — Phase — ${phaseName(event.checkIn.phaseId, context.phases, event.checkIn.phaseLabel)}`;
    case "metrics": {
      const pulse =
        event.checkIn.pulseId === null
          ? undefined
          : context.pulses.find(
              (item) => item.id === event.checkIn.pulseId,
            );
      const pulseLabel =
        pulse?.name ?? event.checkIn.pulseName ?? "Metric check-in";
      const ratings = event.checkIn.ratings
        .map((rating) => {
          const metric = context.metrics.find(
            (item) => item.id === rating.metricId,
          );
          return `${metric?.name ?? `Metric ${rating.metricId}`} ${rating.value}`;
        })
        .join(", ");
      return `- ${time} — Metric check-in — ${pulseLabel}${ratings ? `: ${ratings}` : ""}`;
    }
    case "dump": {
      const tags = event.dump.tags.map((tag) => tag.name).join(", ");
      const detail = tags ? `Tags: ${tags}` : "";
      const body = brainDumpPlainTextLines(event.dump.text)
        .map((line: string) => `  > ${line}`)
        .join("\n");
      return `- ${time} — Brain dump${detail ? ` — ${detail}` : ""}\n${body}`;
    }
    case "task-status":
    case "work-start":
    case "work-stop":
      return `- ${time} — ${taskChangeLabel(event)} — ${taskTitle(context.tasks, taskChangeTaskId(event))}`;
  }
}

export function logDayMarkdown(
  dayKey: number,
  events: RawLogEvent[],
  context: LogExportContext,
) {
  const date = new Date(dayKey).toLocaleDateString(undefined, {
    weekday: "long",
    year: "numeric",
    month: "long",
    day: "numeric",
  });
  const timeline = [...events]
    .sort((a, b) => a.at - b.at ||
      (a.kind === "task-status" && b.kind === "task-status"
        ? a.statusEvent.id - b.statusEvent.id : 0))
    .map((event) => eventMarkdown(event, context))
    .join("\n");
  return `# Nest Timeline — ${date}\n\n${timeline || "_No settled happenings._"}\n`;
}

export function downloadLogDay(
  dayKey: number,
  events: RawLogEvent[],
  context: LogExportContext,
) {
  const url = URL.createObjectURL(
    new Blob([logDayMarkdown(dayKey, events, context)], {
      type: "text/markdown;charset=utf-8",
    }),
  );
  const link = document.createElement("a");
  link.href = url;
  link.download = `nest-timeline-${toDateInput(dayKey / 1000)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}
