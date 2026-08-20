export const LOG_LAYOUTS = [
  { key: "raw", label: "Raw" },
  { key: "timeline", label: "Timeline" },
] as const;
export type LogsLayoutKey = (typeof LOG_LAYOUTS)[number]["key"];

export const RAW_LOG_FILTERS = [
  { key: "all", label: "All" },
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
] as const;
export type RawLogFilterKey = (typeof RAW_LOG_FILTERS)[number]["key"];

export const PHASE_LOG_MODES = [
  { key: "raw", label: "Raw" },
  { key: "aggregated", label: "Aggregated" },
] as const;
export type PhaseLogModeKey = (typeof PHASE_LOG_MODES)[number]["key"];

export type LogsPreferences = {
  layout: LogsLayoutKey;
  rawFilter: RawLogFilterKey;
  phaseMode: PhaseLogModeKey;
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = {
  layout: "raw",
  rawFilter: "all",
  phaseMode: "aggregated",
};
const LAYOUT_KEYS: ReadonlySet<string> = new Set(
  LOG_LAYOUTS.map(({ key }) => key),
);
const FILTER_KEYS: ReadonlySet<string> = new Set(
  RAW_LOG_FILTERS.map(({ key }) => key),
);
const PHASE_MODE_KEYS: ReadonlySet<string> = new Set(
  PHASE_LOG_MODES.map(({ key }) => key),
);

type LogsStorage = Pick<Storage, "getItem" | "setItem">;

export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const value: Record<string, unknown> =
      stored && typeof stored === "object" ? stored : {};
    return {
      layout:
        typeof value.layout === "string" && LAYOUT_KEYS.has(value.layout)
        ? (value.layout as LogsLayoutKey)
        : DEFAULT_LOGS_PREFERENCES.layout,
      rawFilter:
        typeof value.rawFilter === "string" && FILTER_KEYS.has(value.rawFilter)
        ? (value.rawFilter as RawLogFilterKey)
        : DEFAULT_LOGS_PREFERENCES.rawFilter,
      phaseMode:
        typeof value.phaseMode === "string" &&
        PHASE_MODE_KEYS.has(value.phaseMode)
        ? (value.phaseMode as PhaseLogModeKey)
        : DEFAULT_LOGS_PREFERENCES.phaseMode,
    };
  } catch {
    return DEFAULT_LOGS_PREFERENCES;
  }
}

export function writeLogsPreferences(
  preferences: LogsPreferences,
  storage: LogsStorage = localStorage,
) {
  storage.setItem(LOGS_PREFERENCES_KEY, JSON.stringify(preferences));
}
