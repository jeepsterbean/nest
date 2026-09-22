export const SETTINGS_PANES = [
  { key: "assistant", label: "Assistant" },
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
  { key: "tags", label: "Tags" },
  { key: "reminders", label: "Reminders" },
  { key: "lastHour", label: "Last hour" },
  { key: "tasks", label: "Tasks" },
  { key: "timeline", label: "Timeline" },
  { key: "brainDump", label: "Brain dump" },
  { key: "controlPanel", label: "Control panel" },
  { key: "background", label: "Background" },
] as const;

export type SettingsPane = (typeof SETTINGS_PANES)[number]["key"];

const SETTINGS_PANE_KEY = "nest:settings-pane";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

const isSettingsPane = (value: string | null): value is SettingsPane =>
  SETTINGS_PANES.some((pane) => pane.key === value);

/** Metrics is the default Settings pane. An unknown stored value falls back. */
export const readSettingsPane = (
  storage: SettingsStorage = localStorage,
): SettingsPane => {
  const stored = storage.getItem(SETTINGS_PANE_KEY);
  return isSettingsPane(stored) ? stored : "metrics";
};

export const writeSettingsPane = (
  key: SettingsPane,
  storage: SettingsStorage = localStorage,
) => {
  storage.setItem(SETTINGS_PANE_KEY, key);
};
