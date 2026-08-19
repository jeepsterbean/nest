const METRIC_DUE_KEY = "nest:metric-due";

type MetricDueStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

/** Whether the popup Metric panel should keep its gold due treatment. */
export function readMetricDueHeld(storage: MetricDueStorage = localStorage) {
  try {
    return storage.getItem(METRIC_DUE_KEY) === "1";
  } catch {
    return false;
  }
}

/** Persist the Metric-due latch across popup remounts until a Metric check-in is saved. */
export function writeMetricDueHeld(
  held: boolean,
  storage: MetricDueStorage = localStorage,
) {
  try {
    if (held) storage.setItem(METRIC_DUE_KEY, "1");
    else storage.removeItem(METRIC_DUE_KEY);
  } catch {
    // Keep callers working when browser storage is unavailable.
  }
}
