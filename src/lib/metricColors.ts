import type { Metric } from "./types";

/** Preset line colors tuned for Nest's warm palette in light and dark themes. */
export const METRIC_COLOR_PRESETS = [
  "#4a7dd1",
  "#6846a5",
  "#3f6b52",
  "#c18e43",
  "#5f8fb8",
  "#9d4e3b",
  "#35764e",
  "#c0392b",
  "#766c21",
  "#805821",
  "#6f9be0",
  "#a98ee6",
] as const;

export const METRIC_COLOR_FALLBACKS = [
  "var(--accent)",
  "var(--phase)",
  "var(--doing)",
  "var(--dump)",
  "var(--queue)",
  "var(--rating-1)",
  "var(--rating-5)",
  "var(--danger)",
] as const;

export function resolveMetricColor(metric: Metric, index: number): string {
  return metric.color ?? METRIC_COLOR_FALLBACKS[index % METRIC_COLOR_FALLBACKS.length];
}

export function resolveMetricColorFromList(metrics: Metric[], metricId: number): string {
  const index = metrics.findIndex((metric) => metric.id === metricId);
  if (index < 0) return METRIC_COLOR_FALLBACKS[0];
  return resolveMetricColor(metrics[index], index);
}

export function isMetricColorPreset(color: string): boolean {
  return METRIC_COLOR_PRESETS.includes(color as (typeof METRIC_COLOR_PRESETS)[number]);
}
