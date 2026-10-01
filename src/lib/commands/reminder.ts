import { invoke } from "@tauri-apps/api/core";
import type { Reminder } from "../types";

/** Greetings-board line length at the 600px dashboard minimum. */
export const MAX_REMINDER_CHARS = 27;

export function listReminders(): Promise<Reminder[]> {
  return invoke("list_reminders");
}

export function createReminder(text: string): Promise<Reminder> {
  return invoke("create_reminder", { text });
}

export function updateReminderText(id: number, text: string): Promise<Reminder> {
  return invoke("update_reminder_text", { id, text });
}

export function setReminderActive(
  id: number,
  active: boolean,
): Promise<Reminder> {
  return invoke("set_reminder_active", { id, active });
}

export function deleteReminder(id: number): Promise<void> {
  return invoke("delete_reminder", { id });
}
