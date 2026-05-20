import { invoke } from "@tauri-apps/api/core";
import type {
  CheckIn,
  CheckInWithRatings,
  FocusCheckIn,
  FocusCheckInSettings,
  Metric,
  RatingInput,
  SeriesPoint,
  WorkCheckIn,
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

export function submitCheckIn(
  ratings: RatingInput[],
  note: string | null,
): Promise<CheckIn> {
  return invoke("submit_check_in", { ratings, note });
}

export function listCheckIns(
  from: number,
  to: number,
): Promise<CheckInWithRatings[]> {
  return invoke("list_check_ins", { from, to });
}

export function deleteCheckIn(id: number): Promise<void> {
  return invoke("delete_check_in", { id });
}

export function submitWorkCheckIn(
  working: boolean,
  blocker: string | null,
): Promise<WorkCheckIn> {
  return invoke("submit_work_check_in", { working, blocker });
}

export function getFocusCheckInSettings(): Promise<FocusCheckInSettings> {
  return invoke("get_focus_check_in_settings");
}

export function latestFocusCheckIn(): Promise<FocusCheckIn | null> {
  return invoke("latest_focus_check_in");
}

export function submitFocusCheckIn(
  stillWorkingPreviousTask: boolean,
  currentWork: string | null,
  tryingNow: string,
  nextCheckInMinutes: number | null,
): Promise<FocusCheckIn> {
  return invoke("submit_focus_check_in", {
    stillWorkingPreviousTask,
    currentWork,
    tryingNow,
    nextCheckInMinutes,
  });
}

export function metricSeries(
  metricId: number,
  from: number,
  to: number,
): Promise<SeriesPoint[]> {
  return invoke("metric_series", { metricId, from, to });
}
