import { useEffect, useState } from "react";
import {
  BACKGROUND_STYLE_KEY,
  readBackgroundStyle,
  type BackgroundStyle,
} from "../lib/backgroundStyle";

/**
 * Tracks the Background style preference. The native `storage` event only
 * fires in *other* windows than the one that wrote it, so writeBackgroundStyle
 * also dispatches a same-window event under the same key — together they
 * cover both this window's own Background panel and the other window.
 */
export function useBackgroundStyle(): BackgroundStyle {
  const [style, setStyle] = useState<BackgroundStyle>(readBackgroundStyle);

  useEffect(() => {
    const refresh = () => setStyle(readBackgroundStyle());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BACKGROUND_STYLE_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(BACKGROUND_STYLE_KEY, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(BACKGROUND_STYLE_KEY, refresh);
    };
  }, []);

  return style;
}
