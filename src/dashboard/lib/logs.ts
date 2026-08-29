export const LOG_VIEWS = [
  { key: "timeline", label: "Timeline" },
  { key: "dumps", label: "Brain dumps" },
  { key: "phases", label: "Phases" },
  { key: "metrics", label: "Metrics" },
  { key: "raw", label: "Raw" },
] as const;
export type LogsViewKey = (typeof LOG_VIEWS)[number]["key"];

export type LogsPreferences = {
  view: LogsViewKey;
};

export const LOG_EVENT_BATCH_SIZE = 200;

const LOGS_PREFERENCES_KEY = "nest:logs-preferences";
const DEFAULT_LOGS_PREFERENCES: LogsPreferences = {
  view: "raw",
};
const VIEW_KEYS: ReadonlySet<string> = new Set(
  LOG_VIEWS.map(({ key }) => key),
);

type LogsStorage = Pick<Storage, "getItem" | "setItem">;

/** Map legacy layout + rawFilter storage onto the single Logs view key. */
const migrateLegacyView = (value: Record<string, unknown>): LogsViewKey | null => {
  if (value.layout === "timeline") return "timeline";
  if (value.rawFilter === "dumps") return "dumps";
  if (value.rawFilter === "phases") return "phases";
  if (value.rawFilter === "metrics") return "metrics";
  if (value.layout === "raw" || value.rawFilter === "all") return "raw";
  return null;
};

export function readLogsPreferences(
  storage: LogsStorage = localStorage,
): LogsPreferences {
  try {
    const stored = JSON.parse(storage.getItem(LOGS_PREFERENCES_KEY) ?? "null");
    const value: Record<string, unknown> =
      stored && typeof stored === "object" ? stored : {};
    if (typeof value.view === "string" && VIEW_KEYS.has(value.view)) {
      return { view: value.view as LogsViewKey };
    }
    return {
      view: migrateLegacyView(value) ?? DEFAULT_LOGS_PREFERENCES.view,
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
