import { useEffect, useState } from "react";
import {
  BACKGROUND_TUNING_KEY,
  readBackgroundTuning,
  type BackgroundTuning,
} from "../lib/backgroundTuning";

/**
 * Tracks the Background speed/intensity preference. The native `storage`
 * event only fires in *other* windows than the one that wrote it, so
 * writeBackgroundTuning also dispatches a same-window event under the same
 * key — together they cover both this window's own Settings overlay and the
 * other window.
 */
export function useBackgroundTuning(): BackgroundTuning {
  const [tuning, setTuning] = useState<BackgroundTuning>(readBackgroundTuning);

  useEffect(() => {
    const refresh = () => setTuning(readBackgroundTuning());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === BACKGROUND_TUNING_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(BACKGROUND_TUNING_KEY, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(BACKGROUND_TUNING_KEY, refresh);
    };
  }, []);

  return tuning;
}
