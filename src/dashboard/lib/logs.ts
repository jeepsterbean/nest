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
import type { RangeModeStore } from "./insights";
import {
  buildRawLog,
  collapsePhaseCheckIns,
  phaseCheckInsInRange,
  type RawLogEvent,
  type TimelineLogEvent,
} from "./timeline";

export const LOG_KINDS = [
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
  { key: "tasks", label: "Tasks" },
] as const;
export type LogKindKey = (typeof LOG_KINDS)[number]["key"];

const ALL_LOG_KINDS: LogKindKey[] = LOG_KINDS.map(({ key }) => key);

/** List groups events by day; Hours places one day's events on Calendar's
 * hour grid. */
export const LOG_SCALES = [
  { key: "list", label: "List" },
  { key: "hours", label: "Hours" },
] as const;
export type LogScaleKey = (typeof LOG_SCALES)[number]["key"];

/** List and Hours share one selected day, paged one day at a time, with no
 * Day / Week choice of its own. */
export const LOGS_RANGE_STORE: RangeModeStore = {
  read: () => "day",
  write: () => {},
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

/** The nearest day with entries before (-1) or after (1) `dayMs`. List skips
 * empty days because it has no row to land on for them. */
export const adjacentLogDay = (
  dayKeys: readonly number[],
  dayMs: number,
  direction: -1 | 1,
): number | null => {
  if (direction < 0) return dayKeys.find((key) => key < dayMs) ?? null;
  const later = dayKeys.filter((key) => key > dayMs);
  return later[later.length - 1] ?? null;
};

/** The day group List scrolls to for `dayMs`: that day, else the nearest
 * older day with entries, else the oldest one. */
export const logJumpDay = (
  dayKeys: readonly number[],
  dayMs: number,
): number | null =>
  dayKeys.find((key) => key <= dayMs) ?? dayKeys[dayKeys.length - 1] ?? null;

/** How many newest-first events List must render to show all of `dayMs`,
 * rounded up to whole batches so Load older keeps its rhythm. */
export const logEventCountThroughDay = (
  events: readonly { at: number }[],
  dayMs: number,
) => {
  const daySec = dayMs / 1000;
  const needed = events.filter((event) => event.at >= daySec).length;
  return Math.max(
    LOG_EVENT_BATCH_SIZE,
    Math.ceil(needed / LOG_EVENT_BATCH_SIZE) * LOG_EVENT_BATCH_SIZE,
  );
};

/** Selected kinds, kept non-empty and in LOG_KINDS order. Stored as `scale`
 * because older storage already used `layout` for something else. */
export type LogsPreferences = {
  kinds: LogKindKey[];
  scale: LogScaleKey;
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = {
  kinds: ALL_LOG_KINDS,
  scale: "list",
};

type LogsStorage = Pick<Storage, "getItem" | "setItem">;

const inKindOrder = (kinds: readonly unknown[]): LogKindKey[] =>
  ALL_LOG_KINDS.filter((key) => kinds.includes(key));

/** Single click. The last selected kind stays on so Logs never goes blank. */
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

/** Storage from before multi-select (`view` + `layout`) falls back to all kinds
 * on List. */
export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const isObject = stored !== null && typeof stored === "object";
    const kinds =
      isObject && Array.isArray(stored.kinds) ? inKindOrder(stored.kinds) : [];
    const scale: LogScaleKey =
      isObject && stored.scale === "hours" ? "hours" : "list";
    return {
      kinds: kinds.length > 0 ? kinds : DEFAULT_LOGS_PREFERENCES.kinds,
      scale,
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

const isTimelineLogEvent = (event: RawLogEvent): event is TimelineLogEvent =>
  event.kind !== "phase";

/** Overview Timeline tile. Phase changes stay in the time-column color, so they
 * get no row of their own. Logs uses settled Phase rows instead. */
export function buildTimelineLogEvents(
  checkIns: MetricCheckInWithRatings[],
  brainDumps: BrainDump[],
  taskWorkStretches: TaskWorkStretch[],
): TimelineLogEvent[] {
  return buildRawLog(checkIns, [], brainDumps, taskWorkStretches).filter(
    isTimelineLogEvent,
  );
}

/** Logs feed for the selected kinds. Phase rows are settled by the 60-second
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
  return `# Nest Logs — ${date}\n\n${timeline || "_No settled happenings._"}\n`;
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
  link.download = `nest-logs-${toDateInput(dayKey / 1000)}.md`;
  link.click();
  URL.revokeObjectURL(url);
}
