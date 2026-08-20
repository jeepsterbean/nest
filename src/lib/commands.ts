import { invoke } from "@tauri-apps/api/core";
import type {
  BrainDump,
  Metric,
  MetricCheckIn,
  MetricCheckInWithRatings,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  Pulse,
  RatingValue,
  Task,
  TaskDependency,
  TaskStatusEvent,
  TaskWorkStretch,
  TaskStatus,
  TimerState,
} from "./types";

export function listReminders(): Promise<string[]> {
  return invoke("list_reminders");
}

export function listMetrics(): Promise<Metric[]> {
  return invoke("list_metrics");
}

export function createMetric(name: string): Promise<Metric> {
  return invoke("create_metric", { name });
}

export function renameMetric(id: number, name: string): Promise<Metric> {
  return invoke("rename_metric", { id, name });
}

export function setMetricIcon(id: number, icon: string): Promise<Metric> {
  return invoke("set_metric_icon", { id, icon });
}

export function setMetricColor(id: number, color: string | null): Promise<Metric> {
  return invoke("set_metric_color", { id, color });
}

export function listPulses(): Promise<Pulse[]> {
  return invoke("list_pulses");
}

export function createPulse(name: string): Promise<Pulse> {
  return invoke("create_pulse", { name });
}

export function renamePulse(id: number, name: string): Promise<Pulse> {
  return invoke("rename_pulse", { id, name });
}

export function setPulseIcon(id: number, icon: string): Promise<Pulse> {
  return invoke("set_pulse_icon", { id, icon });
}

export function deletePulse(id: number): Promise<void> {
  return invoke("delete_pulse", { id });
}

export function addMetricToPulse(
  pulseId: number,
  metricId: number,
): Promise<void> {
  return invoke("add_metric_to_pulse", { pulseId, metricId });
}

export function removeMetricFromPulse(
  pulseId: number,
  metricId: number,
): Promise<void> {
  return invoke("remove_metric_from_pulse", { pulseId, metricId });
}

export function reorderTasks(ids: number[]): Promise<void> {
  return invoke("reorder_tasks", { ids });
}

export function reorderPulses(ids: number[]): Promise<void> {
  return invoke("reorder_pulses", { ids });
}

export function reorderPulseMetrics(
  pulseId: number,
  metricIds: number[],
): Promise<void> {
  return invoke("reorder_pulse_metrics", { pulseId, metricIds });
}

export function listPhases(includeInactive: boolean): Promise<Phase[]> {
  return invoke("list_phases", { includeInactive });
}

export function listTasks(): Promise<Task[]> {
  return invoke("list_tasks");
}

export function listTaskDependencies(): Promise<TaskDependency[]> {
  return invoke("list_task_dependencies");
}

export function listTaskStatusEvents(
  from: number,
  to: number,
): Promise<TaskStatusEvent[]> {
  return invoke("list_task_status_events", { from, to });
}

export function createTask(
  title: string,
  description: string,
  status: TaskStatus,
  scope: string | null = null,
  parentTaskId: number | null = null,
): Promise<Task> {
  return invoke("create_task", {
    title,
    description,
    status,
    scope,
    parentTaskId,
  });
}

export function renameTask(id: number, title: string): Promise<Task> {
  return invoke("rename_task", { id, title });
}

export function setTaskDescription(
  id: number,
  description: string,
): Promise<Task> {
  return invoke("set_task_description", { id, description });
}

export function setTaskScope(id: number, scope: string | null): Promise<Task> {
  return invoke("set_task_scope", { id, scope });
}

export function setTaskParent(
  id: number,
  parentTaskId: number | null,
): Promise<Task> {
  return invoke("set_task_parent", { id, parentTaskId });
}

export function addTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("add_task_dependency", { blockerTaskId, blockedTaskId });
}

export function removeTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("remove_task_dependency", { blockerTaskId, blockedTaskId });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

export function setTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  return invoke("set_task_status", { id, status });
}

export function setTaskWorking(id: number, working: boolean): Promise<Task> {
  return invoke("set_task_working", { id, working });
}

export function stopAllWorkingNow(): Promise<Task[]> {
  return invoke("stop_all_working_now");
}

export function listTaskWorkStretches(
  from: number,
  to: number,
): Promise<TaskWorkStretch[]> {
  return invoke("list_task_work_stretches", { from, to });
}

export function updateTaskWorkStretch(
  id: number,
  startedAt: number,
  endedAt: number | null,
): Promise<Task> {
  return invoke("update_task_work_stretch", { id, startedAt, endedAt });
}

export function deleteTaskWorkStretch(id: number): Promise<Task> {
  return invoke("delete_task_work_stretch", { id });
}

export function setTaskScore(
  id: number,
  value: RatingValue | null,
  effort: RatingValue | null,
): Promise<Task> {
  return invoke("set_task_score", { id, value, effort });
}

export function submitMetricCheckIn(
  pulseId: number,
  ratings: MetricRatingInput[],
): Promise<MetricCheckIn> {
  return invoke("submit_metric_check_in", { pulseId, ratings });
}

export function listMetricCheckIns(
  from: number,
  to: number,
): Promise<MetricCheckInWithRatings[]> {
  return invoke("list_metric_check_ins", { from, to });
}

export function deleteMetricCheckIn(id: number): Promise<void> {
  return invoke("delete_metric_check_in", { id });
}

export function latestPhaseCheckIn(
  includeIdle = true,
): Promise<PhaseCheckIn | null> {
  return invoke("latest_phase_check_in", { includeIdle });
}

export function listPhaseCheckIns(
  from: number,
  to: number,
): Promise<PhaseCheckIn[]> {
  return invoke("list_phase_check_ins", { from, to });
}

export function getTimerState(): Promise<TimerState> {
  return invoke("get_timer_state");
}

export function startTimer(minutes: number): Promise<TimerState> {
  return invoke("start_timer", { minutes });
}

export function closePopup(
  dismissed: boolean,
  minutes: number | null = null,
): Promise<void> {
  return invoke("close_popup", { dismissed, minutes });
}

export function showPopup(): Promise<void> {
  return invoke("show_popup");
}

export function showDashboard(): Promise<void> {
  return invoke("show_dashboard");
}

export function submitBrainDump(
  text: string,
  title: string | null = null,
): Promise<BrainDump> {
  return invoke("submit_brain_dump", { text, title });
}

export function updateBrainDumpTitle(
  id: number,
  title: string | null,
): Promise<BrainDump> {
  return invoke("update_brain_dump_title", { id, title });
}

export function listBrainDumps(from: number, to: number): Promise<BrainDump[]> {
  return invoke("list_brain_dumps", { from, to });
}

export function logClientEvent(message: string): Promise<void> {
  return invoke("log_client_event", { message });
}

/** Marks that the user started dragging the popup (persist origin on hide). */
export function notePopupDrag(): Promise<void> {
  return invoke("note_popup_drag");
}
