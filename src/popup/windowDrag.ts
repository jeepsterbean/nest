import { getCurrentWindow } from "@tauri-apps/api/window";
import { notePopupDrag } from "../lib/commands";

/** Empty Popup chrome may move the window; controls inside it must not. */
export function isPopupWindowDragTarget(target: EventTarget | null): boolean {
  if (
    target == null ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }
  return !(target as Element).closest(
    "button, [role='listbox'], a, input, textarea",
  );
}

/** Mark placement dirty, then hand the press to the OS window drag. */
export function startPopupWindowDrag() {
  void notePopupDrag()
    .then(() => getCurrentWindow().startDragging())
    .catch((error) => console.error("nest popup drag failed", error));
}
