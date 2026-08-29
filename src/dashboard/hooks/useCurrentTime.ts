import { useSyncExternalStore } from "react";

/** Shared minute clock — one interval for every consumer. */
let nowMs = Date.now();
const listeners = new Set<() => void>();
let intervalId: number | null = null;

const emit = () => {
  nowMs = Date.now();
  listeners.forEach((listener) => listener());
};

const onVisible = () => {
  if (document.visibilityState === "visible") emit();
};

const start = () => {
  if (intervalId !== null) return;
  intervalId = window.setInterval(emit, 60_000);
  document.addEventListener("visibilitychange", onVisible);
  window.addEventListener("focus", emit);
};

const stop = () => {
  if (intervalId === null) return;
  window.clearInterval(intervalId);
  intervalId = null;
  document.removeEventListener("visibilitychange", onVisible);
  window.removeEventListener("focus", emit);
};

const subscribe = (onStoreChange: () => void) => {
  listeners.add(onStoreChange);
  start();
  return () => {
    listeners.delete(onStoreChange);
    if (listeners.size === 0) stop();
  };
};

const getSnapshot = () => nowMs;

/** Minute-resolution clock for summaries whose values change while data stays still.
 * Shared across hooks; refreshes on focus / tab visible after background throttle. */
export function useCurrentTime() {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}
