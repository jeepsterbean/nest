import type { Metric } from "./types";

/** Preset line colors tuned for Nest's warm palette in light and dark themes. */
export const METRIC_COLOR_PRESETS = [
  "#8f3f45",
  "#b95755",
  "#d97872",
  "#9d4e3b",
  "#bf6948",
  "#db8a63",
  "#9a5a32",
  "#c47a3a",
  "#df9a4a",
  "#766c21",
  "#a08e2f",
  "#c8b54b",
  "#3f6b52",
  "#35764e",
  "#6fa678",
  "#2e6f68",
  "#438c83",
  "#6ba9a0",
  "#39738c",
  "#5f8fb8",
  "#83afc7",
  "#3f669c",
  "#4a7dd1",
  "#6f9be0",
  "#505b9f",
  "#6872bd",
  "#8790d4",
  "#6846a5",
  "#8660b7",
  "#a98ee6",
  "#8b4c75",
  "#ae648e",
  "#ca83a8",
  "#805821",
  "#a47335",
  "#c18e43",
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
