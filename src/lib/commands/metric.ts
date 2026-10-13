import { invoke } from "@tauri-apps/api/core";
import type {
  Metric,
  MetricCheckIn,
  MetricCheckInWithRatings,
  MetricRatingInput,
  Pulse,
  PulseMetricEntry,
} from "../types";

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

/** Stores the Pulse, its Metrics, and their memberships together or not at all. */
export function createPulseWithMetrics(
  name: string,
  icon: string,
  metrics: PulseMetricEntry[],
): Promise<Pulse> {
  return invoke("create_pulse_with_metrics", { name, icon, metrics });
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

export function reorderPulses(ids: number[]): Promise<void> {
  return invoke("reorder_pulses", { ids });
}

export function reorderPulseMetrics(
  pulseId: number,
  metricIds: number[],
): Promise<void> {
  return invoke("reorder_pulse_metrics", { pulseId, metricIds });
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
