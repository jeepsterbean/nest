import { getCurrentWindow } from "@tauri-apps/api/window";
import { notePopupDrag } from "../lib/commands";

/** Mark placement dirty, then hand the press to the OS window drag. */
export function startPopupWindowDrag() {
  void notePopupDrag()
    .then(() => getCurrentWindow().startDragging())
    .catch((error) => console.error("nest popup drag failed", error));
}
