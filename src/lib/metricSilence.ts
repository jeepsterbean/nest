const SILENCED_METRICS_KEY = "nest:silenced-metrics";

type MetricSilenceStorage = Pick<Storage, "getItem" | "setItem">;

function fallbackStorage(): MetricSilenceStorage | null {
  try {
    return typeof localStorage === "undefined" ? null : localStorage;
  } catch {
    return null;
  }
}

function asUnixSeconds(nowMs: number) {
  return nowMs / 1000;
}

/** Metric id → unix seconds when Silence ends. */
function readSilencedMetrics(
  storage: MetricSilenceStorage | null = fallbackStorage(),
) {
  if (!storage) return new Map<number, number>();
  try {
    const raw = storage.getItem(SILENCED_METRICS_KEY);
    if (!raw) return new Map<number, number>();
    const parsed: unknown = JSON.parse(raw);
    if (parsed === null || typeof parsed !== "object" || Array.isArray(parsed)) {
      return new Map<number, number>();
    }
    const map = new Map<number, number>();
    for (const [key, until] of Object.entries(parsed)) {
      const id = Number(key);
      if (!Number.isSafeInteger(id) || id <= 0) continue;
      if (typeof until !== "number" || !Number.isFinite(until)) continue;
      map.set(id, until);
    }
    return map;
  } catch {
    return new Map<number, number>();
  }
}

function persistSilencedMetrics(
  map: Map<number, number>,
  storage: MetricSilenceStorage,
) {
  storage.setItem(
    SILENCED_METRICS_KEY,
    JSON.stringify(Object.fromEntries(map)),
  );
}

export function silenceUntil(intervalMinutes: number, nowMs = Date.now()) {
  return Math.floor(asUnixSeconds(nowMs)) + intervalMinutes * 60;
}

export function readSilencedMetricIds(
  nowMs = Date.now(),
  storage: MetricSilenceStorage | null = fallbackStorage(),
) {
  const now = asUnixSeconds(nowMs);
  const ids = new Set<number>();
  for (const [id, until] of readSilencedMetrics(storage)) {
    if (until > now) ids.add(id);
  }
  return ids;
}

export function silenceMetric(
  id: number,
  untilUnixSeconds: number,
  nowMs = Date.now(),
  storage: MetricSilenceStorage | null = fallbackStorage(),
) {
  const now = asUnixSeconds(nowMs);
  const map = readSilencedMetrics(storage);
  for (const [metricId, until] of map) {
    if (until <= now) map.delete(metricId);
  }
  map.set(id, untilUnixSeconds);
  if (storage) persistSilencedMetrics(map, storage);
}
