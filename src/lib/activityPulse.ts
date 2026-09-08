import { emit } from "@tauri-apps/api/event";

/** Fired on task completions and check-ins; the ambient visualizer reacts to it. */
export function pulseActivity() {
  void emit("activity-pulse");
}
