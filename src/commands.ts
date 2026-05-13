import { invoke } from "@tauri-apps/api/core";
import type {
  CheckIn,
  CheckInWithRatings,
  Metric,
  RatingInput,
  SeriesPoint,
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

export function metricSeries(
  metricId: number,
  from: number,
  to: number,
): Promise<SeriesPoint[]> {
  return invoke("metric_series", { metricId, from, to });
}
