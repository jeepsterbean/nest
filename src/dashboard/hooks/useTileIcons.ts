import { useEffect, useState } from "react";
import {
  TILE_ICONS_KEY,
  readTileIcons,
  type TileIcons,
} from "../lib/tileIcons";

/**
 * Tracks the Section and pane icon preferences across both windows. The native
 * `storage` event only fires in the other window, so writes also dispatch a
 * same-window event under `TILE_ICONS_KEY`.
 */
export function useTileIcons(): TileIcons {
  const [icons, setIcons] = useState(readTileIcons);

  useEffect(() => {
    const refresh = () => setIcons(readTileIcons());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === TILE_ICONS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(TILE_ICONS_KEY, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(TILE_ICONS_KEY, refresh);
    };
  }, []);

  return icons;
}
