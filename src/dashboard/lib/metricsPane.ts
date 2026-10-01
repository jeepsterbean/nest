export const METRIC_PANES = [
  { key: "pulses", label: "Pulses" },
  { key: "all", label: "Metrics" },
] as const;

export type MetricsPane = (typeof METRIC_PANES)[number]["key"];

const METRICS_PANE_KEY = "nest:metrics-pane";

type PaneStorage = Pick<Storage, "getItem" | "setItem">;

const isMetricsPane = (value: string | null): value is MetricsPane =>
  METRIC_PANES.some((pane) => pane.key === value);

/** Pulses is the default Metrics pane. An unknown stored value falls back. */
export const readMetricsPane = (
  storage: PaneStorage = localStorage,
): MetricsPane => {
  const stored = storage.getItem(METRICS_PANE_KEY);
  return isMetricsPane(stored) ? stored : "pulses";
};

export const writeMetricsPane = (
  key: MetricsPane,
  storage: PaneStorage = localStorage,
) => {
  storage.setItem(METRICS_PANE_KEY, key);
};
