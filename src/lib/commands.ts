import { invoke } from "@tauri-apps/api/core";
import type {
  BrainDump,
  Metric,
  MetricCheckIn,
  MetricCheckInWithRatings,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  SeriesPoint,
  TaskCheckIn,
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
  nextCheckInMinutes: number | null,
): Promise<TaskCheckIn> {
  return invoke("submit_task_check_in", {
    stillWorkingPreviousTask,
    currentWork,
    nextCheckInMinutes,
  });
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
