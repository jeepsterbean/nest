import { brainDumpPlainTextLines } from "../../lib/brainDumpRichText";
import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  Task,
} from "../../lib/types";
import { foldIdleIntoOffline, phaseName } from "./period";
import type { TaskGraphProjection } from "./taskGraph";
import { phaseSessionTotals, phaseSessionsInWindow } from "./timeline";
import { formatCompactDuration, formatTime, formatWorkedTime } from "./time";

export type TaskSelection = "none" | "active" | "workingNow" | "activeUpNext" | "activeUpNextBacklog";
export type PhaseSelection = "none" | "15m" | "30m" | "1h";
export type DumpSelection = "none" | "last1" | "last3" | "last5" | "15m" | "30m" | "1h" | "3h";
export type MetricSelection = "none" | "last1" | "last2" | "last3" | "15m" | "30m" | "1h";
export type AssistantBlock = "task" | "phase" | "dump" | "metric" | "message";

export type TaskDetail = {
  status: boolean;
  scope: boolean;
  description: boolean;
  blockers: boolean;
  parent: boolean;
  children: boolean;
  value: boolean;
  effort: boolean;
  workedTime: boolean;
  created: boolean;
  updated: boolean;
};

export type LayoutPart =
  | { id: number; kind: "block"; block: AssistantBlock }
  | { id: number; kind: "text"; text: string };

export type AssistantContextPreferences = {
  tasks: TaskSelection;
  phase: PhaseSelection;
  dumps: DumpSelection;
  metrics: MetricSelection;
  taskDetail: TaskDetail;
  layout: LayoutPart[];
};

export const DEFAULT_TASK_DETAIL: TaskDetail = {
  status: true, scope: true, description: false, blockers: true, parent: false,
  children: false, value: false, effort: false, workedTime: false, created: false, updated: false,
};

export const DEFAULT_ASSISTANT_CONTEXT: AssistantContextPreferences = {
  tasks: "none",
  phase: "none",
  dumps: "none",
  metrics: "none",
  taskDetail: DEFAULT_TASK_DETAIL,
  layout: [
    { id: 1, kind: "block", block: "task" },
    { id: 2, kind: "block", block: "phase" },
    { id: 3, kind: "block", block: "dump" },
    { id: 4, kind: "block", block: "metric" },
    { id: 5, kind: "block", block: "message" },
  ],
};

export type AssistantContextData = {
  tasks: Task[];
  taskGraph: TaskGraphProjection;
  phases: Phase[];
  phaseCheckIns: PhaseCheckIn[];
  brainDumps: BrainDump[];
  metrics: Metric[];
  checkIns: MetricCheckInWithRatings[];
};

const windowSeconds = (selection: string) => ({ "15m": 900, "30m": 1_800, "1h": 3_600, "3h": 10_800 }[selection] ?? 0);
const countSelection = (selection: string) => Number(selection.replace("last", "")) || 0;

export function formatTasks(
  tasks: Task[], graph: TaskGraphProjection, selection: TaskSelection, detail: TaskDetail,
) {
  const statuses = selection === "active" || selection === "workingNow" ? ["active"] :
    selection === "activeUpNext" ? ["active", "up_next"] : ["active", "up_next", "backlog"];
  const selected = selection === "none" ? [] : tasks.filter((task) =>
    selection === "workingNow" ? task.workingNow : statuses.includes(task.status),
  );
  if (selected.length === 0) return "";
  const lines = [`Tasks · ${selection === "workingNow" ? "working now" : selection.replace(/([A-Z])/g, " + $1").toLowerCase()}`];
  for (const task of selected) {
    lines.push(`- ${task.title}`);
    const fields: string[] = [];
    if (detail.status) fields.push(`status: ${task.status.replace("_", " ")}`);
    if (detail.scope && task.scope) fields.push(`scope: ${task.scope}`);
    if (detail.value && task.value !== null) fields.push(`value: ${task.value}`);
    if (detail.effort && task.effort !== null) fields.push(`effort: ${task.effort}`);
    if (detail.workedTime) fields.push(`worked time: ${formatWorkedTime(task.workedSeconds)}`);
    if (detail.created) fields.push(`created: ${formatTime(task.createdAt)}`);
    if (detail.updated) fields.push(`updated: ${formatTime(task.updatedAt)}`);
    if (fields.length) lines.push(`  ${fields.join(" · ")}`);
    if (detail.description && task.description.trim()) lines.push(`  ${task.description.trim()}`);
    if (detail.blockers) {
      const blockers = graph.blockersByTask.get(task.id)?.filter((item) => item.status !== "completed") ?? [];
      lines.push(blockers.length ? `  blocked by: ${blockers.map((item) => item.title).join(", ")}` : "  ready");
    }
    if (detail.parent && task.parentTaskId !== null) lines.push(`  parent: ${graph.byId.get(task.parentTaskId)?.title ?? `Task ${task.parentTaskId}`}`);
    if (detail.children) {
      const children = graph.childrenByParent.get(task.id) ?? [];
      if (children.length) lines.push(`  children: ${children.map((item) => item.title).join(", ")}`);
    }
  }
  return lines.join("\n");
}

export function formatPhase(phases: Phase[], checkIns: PhaseCheckIn[], selection: PhaseSelection, now = Math.floor(Date.now() / 1000)) {
  const seconds = windowSeconds(selection);
  if (!seconds) return "";
  const totals = foldIdleIntoOffline(
    phaseSessionTotals(phaseSessionsInWindow(checkIns, now - seconds, now, (id) => id === null || ["Resting", "Offline"].includes(phaseName(id, phases)), false)), phases,
  );
  if (!totals.length) return "";
  return `Phase · last ${selection}\n${totals.map((total) => `${phaseName(total.phaseId, phases)} ${formatCompactDuration(total.seconds)}`).join(" · ")}`;
}

export function formatDumps(dumps: BrainDump[], selection: DumpSelection, now = Math.floor(Date.now() / 1000)) {
  const count = countSelection(selection);
  const rows = count ? dumps.slice(0, count) : dumps.filter((dump) => dump.createdAt >= now - windowSeconds(selection));
  if (selection === "none" || rows.length === 0) return "";
  return `Brain dumps · ${count ? `last ${count}` : `last ${selection}`}\n${rows.map((dump) => `- ${formatTime(dump.createdAt)}  ${brainDumpPlainTextLines(dump.text).join(" ")}`).join("\n")}`;
}

export function formatMetrics(metrics: Metric[], checkIns: MetricCheckInWithRatings[], selection: MetricSelection, now = Math.floor(Date.now() / 1000)) {
  const count = countSelection(selection);
  const rows = count ? checkIns.slice(0, count) : checkIns.filter((checkIn) => checkIn.createdAt >= now - windowSeconds(selection));
  if (selection === "none" || rows.length === 0) return "";
  return `Metrics · ${count ? `last ${count}` : `last ${selection}`}\n${rows.map((checkIn) => `- ${formatTime(checkIn.createdAt)}  ${checkIn.ratings.map((rating) => `${metrics.find((metric) => metric.id === rating.metricId)?.name ?? `Metric ${rating.metricId}`} ${rating.value}`).join("  ")}`).join("\n")}`;
}

export function assembleContext(layout: LayoutPart[], blocks: Record<AssistantBlock, string>) {
  return layout.map((part) => part.kind === "text" ? part.text.trim() : blocks[part.block].trim()).filter(Boolean).join("\n\n");
}

export function buildAssistantContext(data: AssistantContextData, preferences: AssistantContextPreferences, message: string) {
  const blocks: Record<AssistantBlock, string> = {
    task: formatTasks(data.tasks, data.taskGraph, preferences.tasks, preferences.taskDetail),
    phase: formatPhase(data.phases, data.phaseCheckIns, preferences.phase),
    dump: formatDumps(data.brainDumps, preferences.dumps),
    metric: formatMetrics(data.metrics, data.checkIns, preferences.metrics),
    message,
  };
  const context = assembleContext(preferences.layout, blocks);
  const hasExtras = context !== message;
  return { context: hasExtras ? context : null, hasExtras };
}
