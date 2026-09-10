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
} from "./timeline";

export const LOG_VIEWS = [
  { key: "timeline", label: "Timeline" },
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
  { key: "raw", label: "Raw" },
] as const;
export type LogsViewKey = (typeof LOG_VIEWS)[number]["key"];

export type LogsPreferences = {
  view: LogsViewKey;
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = {
  view: "raw",
};
const VIEW_KEYS: ReadonlySet<string> = new Set(
  LOG_VIEWS.map(({ key }) => key),
);

type LogsStorage = Pick<Storage, "getItem" | "setItem">;

/** Map legacy layout + rawFilter storage onto the single Logs view key. */
const migrateLegacyView = (value: Record<string, unknown>): LogsViewKey | null => {
  if (value.layout === "timeline") return "timeline";
  if (value.rawFilter === "dumps") return "dumps";
  if (value.rawFilter === "phases") return "phases";
  if (value.rawFilter === "metrics") return "metrics";
  if (value.layout === "raw" || value.rawFilter === "all") return "raw";
  return null;
};

export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const value: Record<string, unknown> =
      stored && typeof stored === "object" ? stored : {};
    if (typeof value.view === "string" && VIEW_KEYS.has(value.view)) {
      return { view: value.view as LogsViewKey };
    }
    return {
      view: migrateLegacyView(value) ?? DEFAULT_LOGS_PREFERENCES.view,
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

/** Mixed Timeline / export feed: happenings plus settled Phase changes. */
export function buildLogExportEvents(
  checkIns: MetricCheckInWithRatings[],
  phaseCheckIns: PhaseCheckIn[],
  brainDumps: BrainDump[],
  taskWorkStretches: TaskWorkStretch[],
  historyFromSec: number,
) {
  return buildRawLog(
    checkIns,
    phaseCheckInsInRange(
      collapsePhaseCheckIns(phaseCheckIns),
      historyFromSec,
    ),
    brainDumps,
    taskWorkStretches,
  );
}

type LogExportContext = {
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
};

const taskTitle = (tasks: Task[], taskId: number) =>
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
