import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Pulse,
  Task,
  TaskWorkStretch,
} from "../../lib/types";
import { brainDumpPlainTextLines } from "../../lib/brainDumpRichText";
import { phaseName } from "./period";
import { formatTime, toDateInput } from "./time";
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

/** Selected kinds, kept non-empty and in LOG_KINDS order. */
export type LogsPreferences = {
  kinds: LogKindKey[];
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = { kinds: ALL_LOG_KINDS };

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

/** Storage from before multi-select (`view` + `layout`) falls back to all kinds. */
export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const kinds =
      stored && typeof stored === "object" && Array.isArray(stored.kinds)
        ? inKindOrder(stored.kinds)
        : [];
    return kinds.length > 0 ? { kinds } : DEFAULT_LOGS_PREFERENCES;
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
  );
}

/** Day export feed: happenings plus settled Phase changes. */
export function buildLogExportEvents(
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
  taskWorkStretches: TaskWorkStretch[],
  historyFromSec: number,
) {
  return buildLogsEvents(
    ALL_LOG_KINDS,
    false,
    checkIns,
    phaseCheckIns,
    brainDumps,
    taskWorkStretches,
    historyFromSec,
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
    case "work-start":
      return `- ${time} — Working now started — ${taskTitle(context.tasks, event.stretch.taskId)}`;
    case "work-stop":
      return `- ${time} — Working now stopped — ${taskTitle(context.tasks, event.stretch.taskId)}`;
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
    .sort((a, b) => a.at - b.at)
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
