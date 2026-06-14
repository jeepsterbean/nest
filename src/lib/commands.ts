import { invoke } from "@tauri-apps/api/core";
import type {
  BrainDump,
  CheckInSchedule,
  Metric,
  MetricCheckIn,
  MetricCheckInWithRatings,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  SeriesPoint,
  Task,
  TaskCheckIn,
  TaskStatus,
  TaskStatusEvent,
} from "./types";

export function listMetrics(includeInactive: boolean): Promise<Metric[]> {
  return invoke("list_metrics", { includeInactive });
}

export function createMetric(name: string): Promise<Metric> {
  return invoke("create_metric", { name });
}

export function renameMetric(id: number, name: string): Promise<Metric> {
  return invoke("rename_metric", { id, name });
}

export function setMetricActive(id: number, active: boolean): Promise<Metric> {
  return invoke("set_metric_active", { id, active });
}

export function listPhases(includeInactive: boolean): Promise<Phase[]> {
  return invoke("list_phases", { includeInactive });
}

export function createPhase(name: string): Promise<Phase> {
  return invoke("create_phase", { name });
}

export function renamePhase(id: number, name: string): Promise<Phase> {
  return invoke("rename_phase", { id, name });
}

export function setPhaseActive(id: number, active: boolean): Promise<Phase> {
  return invoke("set_phase_active", { id, active });
}

export function listTasks(): Promise<Task[]> {
  return invoke("list_tasks");
}

export function listTaskStatusEvents(
  taskId?: number,
): Promise<TaskStatusEvent[]> {
  return invoke("list_task_status_events", { taskId: taskId ?? null });
}

export function createTask(
  title: string,
  description: string,
  status: TaskStatus,
): Promise<Task> {
  return invoke("create_task", { title, description, status });
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

export function setTaskStatus(id: number, status: TaskStatus): Promise<Task> {
  return invoke("set_task_status", { id, status });
}

export function submitMetricCheckIn(
  ratings: MetricRatingInput[],
): Promise<MetricCheckIn> {
  return invoke("submit_metric_check_in", { ratings });
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

export function submitPhaseCheckIn(
  phaseId: number,
): Promise<PhaseCheckIn> {
  return invoke("submit_phase_check_in", { phaseId });
}

export function latestPhaseCheckIn(): Promise<PhaseCheckIn | null> {
  return invoke("latest_phase_check_in");
}

export function listPhaseCheckIns(
  from: number,
  to: number,
): Promise<PhaseCheckIn[]> {
  return invoke("list_phase_check_ins", { from, to });
}

export function latestTaskCheckIn(): Promise<TaskCheckIn | null> {
  return invoke("latest_task_check_in");
}

export function submitTaskCheckIn(
  stillWorkingPreviousTask: boolean,
  currentWork: string | null,
): Promise<TaskCheckIn> {
  return invoke("submit_task_check_in", {
    stillWorkingPreviousTask,
    currentWork,
  });
}

export function getCheckInSchedule(): Promise<CheckInSchedule> {
  return invoke("get_check_in_schedule");
}

export function scheduleNextCheckIn(minutes: number): Promise<CheckInSchedule> {
  return invoke("schedule_next_check_in", { minutes });
}

export function submitBrainDump(text: string): Promise<BrainDump> {
  return invoke("submit_brain_dump", { text });
}

export function listBrainDumps(from: number, to: number): Promise<BrainDump[]> {
  return invoke("list_brain_dumps", { from, to });
}

export function metricSeries(
  metricId: number,
  from: number,
  to: number,
): Promise<SeriesPoint[]> {
  return invoke("metric_series", { metricId, from, to });
}

export function logClientEvent(message: string): Promise<void> {
  return invoke("log_client_event", { message });
}
