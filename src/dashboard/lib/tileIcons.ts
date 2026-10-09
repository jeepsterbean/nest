import { NEST_ICONS } from "../components/PulseIcon";

// Named for the retired Overview tiles; kept so saved icon choices carry over.
export const TILE_ICONS_KEY = "nest:overview-tile-icons";

/** Icons a person can change. Last hour stays on the Insights mark. */
const CONFIGURABLE_ICON_IDS = [
  "calendar",
  "timeline",
  "core",
  "tasks",
  "brainDump",
  "metrics",
  "phases",
] as const;

export type ConfigurableIcon = (typeof CONFIGURABLE_ICON_IDS)[number];
export type TileIcons = Record<ConfigurableIcon | "lastHour", string>;

export const DEFAULT_TILE_ICONS: TileIcons = {
  calendar: "date",
  timeline: "calendar",
  core: "core",
  lastHour: "insights",
  tasks: "check",
  brainDump: "brain",
  metrics: "gauge",
  phases: "activity",
};

type TileIconStorage = Pick<Storage, "getItem" | "setItem">;

const NEST_ICON_KEYS = new Set<string>(NEST_ICONS.map(({ key }) => key));

const isTileIconsRecord = (
  value: unknown,
): value is Partial<TileIcons> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNestIconKey = (value: unknown): value is string =>
  typeof value === "string" && NEST_ICON_KEYS.has(value);

export function readTileIcons(
  storage: Pick<Storage, "getItem"> = localStorage,
): TileIcons {
  const stored = storage.getItem(TILE_ICONS_KEY);
  if (stored === null) return { ...DEFAULT_TILE_ICONS };

  try {
    const parsed = JSON.parse(stored);
    if (!isTileIconsRecord(parsed)) return { ...DEFAULT_TILE_ICONS };

    const icons = { ...DEFAULT_TILE_ICONS };
    for (const id of CONFIGURABLE_ICON_IDS) {
      const icon = parsed[id];
      if (isNestIconKey(icon)) icons[id] = icon;
    }
    return icons;
  } catch {
    return { ...DEFAULT_TILE_ICONS };
  }
}

export function writeTileIcon(
  id: ConfigurableIcon,
  icon: string,
  storage: TileIconStorage = localStorage,
) {
  if (!isNestIconKey(icon)) return;
  try {
    const current = readTileIcons(storage);
    storage.setItem(
      TILE_ICONS_KEY,
      JSON.stringify({ ...current, [id]: icon }),
    );
    if (storage === localStorage) {
      // The native `storage` event only fires in *other* windows, so also
      // signal same-window listeners.
      window.dispatchEvent(new Event(TILE_ICONS_KEY));
    }
  } catch {
    // Keep icon pickers usable when storage is unavailable.
  }
}
