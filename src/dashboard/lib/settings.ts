export const SETTINGS_PANES = [
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
  { key: "tags", label: "Tags" },
] as const;

export type SettingsPane = (typeof SETTINGS_PANES)[number]["key"];

const SETTINGS_PANE_KEY = "nest:settings-pane";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

/** Metrics is the default Settings pane. An unknown stored value falls back. */
export const readSettingsPane = (
  storage: SettingsStorage = localStorage,
): SettingsPane => {
  const stored = storage.getItem(SETTINGS_PANE_KEY);
  return stored === "metrics" || stored === "phases" || stored === "tags"
    ? stored
    : "metrics";
};

export const writeSettingsPane = (
  key: SettingsPane,
  storage: SettingsStorage = localStorage,
) => {
  storage.setItem(SETTINGS_PANE_KEY, key);
};
