import { listen } from "@tauri-apps/api/event";

/**
 * Tauri's unlisten is async and throws if that eventId is already gone
 * (StrictMode remount, hashchange remount, HMR).
 */
export function unlistenSafe(unlisten?: () => unknown) {
  if (!unlisten) return;
  try {
    void Promise.resolve(unlisten()).catch(() => undefined);
  } catch {
    // Sync throw from a non-async unlisten.
  }
}

/** Bind a Tauri event for the lifetime of a React effect. */
export function subscribeTauriEvent(
  event: string,
  handler: () => void,
): () => void {
  let cancelled = false;
  let unlisten: (() => unknown) | undefined;
  void listen(event, handler).then((u) => {
    if (cancelled) unlistenSafe(u);
    else unlisten = u;
  });
  return () => {
    cancelled = true;
    unlistenSafe(unlisten);
    unlisten = undefined;
  };
}
