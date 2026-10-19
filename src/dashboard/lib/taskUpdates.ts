import type { TaskUpdate, TaskUpdateKind, TaskWorkInterval } from "../../lib/types";
import { formatDate, formatTime } from "./time";
import { RECORDED_TASK_STATUS_LABEL } from "./tasks";

export const TASK_UPDATE_LABEL: Record<TaskUpdateKind, string> = {
  created: "Task created", status: "Status changed", title: "Renamed", description: "Description updated",
  value: "Value", effort: "Effort", parent_set: "Parent set",
  parent_removed: "Parent removed", child_added: "Child added", child_removed: "Child removed",
  follows: "Follows task", follow_up: "Follow-up created",
  follows_removed: "Follows link removed", follow_up_removed: "Follow-up removed", work_started: "Started work",
  work_stopped: "Stopped work", work_corrected: "Work corrected", work_removed: "Work removed",
};

// A recorded interval is a past snapshot, so an open end means the stretch was
// still running then. "Working now" would claim it is live today.
function workIntervalLabel({ startedAt, endedAt }: TaskWorkInterval): string {
  const moment = (seconds: number) => `${formatDate(seconds)}, ${formatTime(seconds)}`;
  return `${moment(startedAt)} – ${endedAt === null ? "still running" : moment(endedAt)}`;
}

export function taskUpdateDetail(update: TaskUpdate): string | null {
  if (update.relatedTitle !== null) return update.relatedTitle;
  if (update.workBefore !== null || update.workAfter !== null) {
    return [update.workBefore, update.workAfter]
      .filter((interval) => interval !== null).map(workIntervalLabel).join(" → ");
  }
  if (update.beforeValue === null && update.afterValue === null) return null;
  const recordsStatus = update.kind === "status" || update.kind === "created";
  const valueLabel = (value: string | null) => value === null ? "None"
    : recordsStatus ? (RECORDED_TASK_STATUS_LABEL as Record<string, string>)[value] ?? value : value;
  if (update.kind === "created") return valueLabel(update.afterValue);
  return `${valueLabel(update.beforeValue)} → ${valueLabel(update.afterValue)}`;
}

