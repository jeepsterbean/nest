import { useEffect, useState } from "react";
import {
  APP_SETTINGS_KEY,
  readAppSettings,
  type AppSettings,
} from "../lib/appSettings";

/** Tracks Settings. Writes dispatch a same-window event because the native
 *  `storage` event only fires in other windows. */
export function useAppSettings(): AppSettings {
  const [settings, setSettings] = useState<AppSettings>(readAppSettings);

  useEffect(() => {
    const refresh = () => setSettings(readAppSettings());
    const onStorage = (event: StorageEvent) => {
      if (event.key === null || event.key === APP_SETTINGS_KEY) refresh();
    };
    window.addEventListener("storage", onStorage);
    window.addEventListener(APP_SETTINGS_KEY, refresh);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener(APP_SETTINGS_KEY, refresh);
    };
  }, []);

  return settings;
}
