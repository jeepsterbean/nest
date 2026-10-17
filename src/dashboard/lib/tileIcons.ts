import { NEST_ICONS } from "../components/PulseIcon";

// Named for the retired Overview tiles; kept so saved icon choices carry over.
export const TILE_ICONS_KEY = "nest:overview-tile-icons";

/** Section icons a person can change. */
const CONFIGURABLE_ICON_IDS = [
  "recap",
  "tasks",
  "notes",
  "metrics",
  "phases",
] as const;

export type ConfigurableIcon = (typeof CONFIGURABLE_ICON_IDS)[number];
export type TileIcons = Record<ConfigurableIcon, string>;

export const DEFAULT_TILE_ICONS: TileIcons = {
  recap: "date",
  tasks: "check",
  notes: "notes",
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
    // The Recap Section was named Calendar, and its choice was saved under
    // that id.
    const legacyRecapIcon = (parsed as { calendar?: unknown }).calendar;
    if (isNestIconKey(legacyRecapIcon)) icons.recap = legacyRecapIcon;
    // Notes were called Brain dump, and its choice was saved under that id.
    const legacyNotesIcon = (parsed as { brainDump?: unknown }).brainDump;
    if (isNestIconKey(legacyNotesIcon)) icons.notes = legacyNotesIcon;
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
