import { NEST_ICONS } from "../components/PulseIcon";
import { TILE_IDS, type TileId } from "./overviewGrid";

export const TILE_ICONS_KEY = "nest:overview-tile-icons";
export type ConfigurableOverviewIcon =
  | "overview"
  | "phases"
  | Exclude<TileId, "lastHour">;
export type OverviewIcons = Record<TileId | "overview" | "phases", string>;

export const DEFAULT_TILE_ICONS: OverviewIcons = {
  overview: "layout-grid",
  lastHour: "insights",
  tasks: "check",
  timeline: "calendar",
  brainDump: "brain",
  metrics: "gauge",
  // Phases has no Overview tile; this slot is the Sidebar Section icon only.
  phases: "activity",
  controlPanel: "compass",
};

type TileIconStorage = Pick<Storage, "getItem" | "setItem">;

const NEST_ICON_KEYS = new Set<string>(NEST_ICONS.map(({ key }) => key));

const isTileIconsRecord = (
  value: unknown,
): value is Partial<OverviewIcons> =>
  !!value && typeof value === "object" && !Array.isArray(value);

const isNestIconKey = (value: unknown): value is string =>
  typeof value === "string" && NEST_ICON_KEYS.has(value);

export function readTileIcons(
  storage: Pick<Storage, "getItem"> = localStorage,
): OverviewIcons {
  const stored = storage.getItem(TILE_ICONS_KEY);
  if (stored === null) return { ...DEFAULT_TILE_ICONS };

  try {
    const parsed = JSON.parse(stored);
    if (!isTileIconsRecord(parsed)) return { ...DEFAULT_TILE_ICONS };

    const icons = { ...DEFAULT_TILE_ICONS };
    for (const id of ["overview", "phases", ...TILE_IDS] as const) {
      if (id === "lastHour") continue;
      const icon = parsed[id];
      if (isNestIconKey(icon)) icons[id] = icon;
    }
    return icons;
  } catch {
    return { ...DEFAULT_TILE_ICONS };
  }
}

export function writeTileIcon(
  id: ConfigurableOverviewIcon,
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
