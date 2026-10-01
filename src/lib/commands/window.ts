import { invoke } from "@tauri-apps/api/core";

export function closePopup(dismissed: boolean): Promise<void> {
  return invoke("close_popup", { dismissed });
}

export function showDashboard(): Promise<void> {
  return invoke("show_dashboard");
}

export function logClientEvent(message: string): Promise<void> {
  return invoke("log_client_event", { message });
}

/** Marks that the user started dragging the popup (persist origin on hide). */
export function notePopupDrag(): Promise<void> {
  return invoke("note_popup_drag");
}
