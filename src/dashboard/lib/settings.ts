export const SETTINGS_PANES = [
  { key: "assistant", label: "Assistant" },
  { key: "reminders", label: "Reminders" },
  { key: "background", label: "Background" },
] as const;

export type SettingsPane = (typeof SETTINGS_PANES)[number]["key"];

const SETTINGS_PANE_KEY = "nest:settings-pane";

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

const isSettingsPane = (value: string | null): value is SettingsPane =>
  SETTINGS_PANES.some((pane) => pane.key === value);

/** Assistant is the default Settings pane. An unknown stored value falls back. */
export const readSettingsPane = (
  storage: SettingsStorage = localStorage,
): SettingsPane => {
  const stored = storage.getItem(SETTINGS_PANE_KEY);
  return isSettingsPane(stored) ? stored : "assistant";
};

export const writeSettingsPane = (
  key: SettingsPane,
  storage: SettingsStorage = localStorage,
) => {
  storage.setItem(SETTINGS_PANE_KEY, key);
};
