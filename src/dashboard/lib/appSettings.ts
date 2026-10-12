export const APP_SETTINGS_KEY = "nest:settings";

export type AppSettings = {
  /** Map is a Tasks layout. Hidden until this is on. */
  showTaskMap: boolean;
  /** Second click on a selected Sidebar or Core icon opens the icon picker. */
  iconSelection: boolean;
};

export const DEFAULT_APP_SETTINGS: AppSettings = {
  showTaskMap: false,
  iconSelection: true,
};

type SettingsStorage = Pick<Storage, "getItem" | "setItem">;

const isRecord = (value: unknown): value is Record<string, unknown> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const booleanOr = (value: unknown, fallback: boolean) =>
  typeof value === "boolean" ? value : fallback;

/** Map stays hidden. Icon selection stays available. Unknown stored values fall back per field. */
export const readAppSettings = (
  storage: Pick<Storage, "getItem"> = localStorage,
): AppSettings => {
  const stored = storage.getItem(APP_SETTINGS_KEY);
  if (stored === null) return { ...DEFAULT_APP_SETTINGS };

  try {
    const parsed: unknown = JSON.parse(stored);
    if (!isRecord(parsed)) return { ...DEFAULT_APP_SETTINGS };
    return {
      showTaskMap: booleanOr(parsed.showTaskMap, DEFAULT_APP_SETTINGS.showTaskMap),
      iconSelection: booleanOr(parsed.iconSelection, DEFAULT_APP_SETTINGS.iconSelection),
    };
  } catch {
    return { ...DEFAULT_APP_SETTINGS };
  }
};

export const writeAppSettings = (
  patch: Partial<AppSettings>,
  storage: SettingsStorage = localStorage,
) => {
  const next = { ...readAppSettings(storage), ...patch };
  storage.setItem(APP_SETTINGS_KEY, JSON.stringify(next));
  if (typeof localStorage !== "undefined" && storage === localStorage) {
    window.dispatchEvent(new Event(APP_SETTINGS_KEY));
  }
};
