import { useState, type FormEvent } from "react";
import {
  createReminder,
  deleteReminder,
  MAX_REMINDER_CHARS,
  setReminderActive,
  updateReminderText,
} from "../../lib/commands";
import { trashIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";

export function RemindersView() {
  const { reminders, mutate } = useDashboardData();
  const [text, setText] = useState("");
  const rename = useInlineRename({
    rename: updateReminderText,
    isUnchanged: (id, next) =>
      reminders.some((reminder) => reminder.id === id && reminder.text === next),
    mutate,
  });

  const create = async (event: FormEvent) => {
    event.preventDefault();
    const next = text.trim();
    if (!next) return;
    if (await mutate(() => createReminder(next))) setText("");
  };

  const remove = (id: number, reminderText: string) => {
    if (!window.confirm(`Delete “${reminderText}”?`)) return;
    void mutate(() => deleteReminder(id));
  };

  const toggleActive = (id: number, active: boolean) => {
    void mutate(() => setReminderActive(id, !active));
  };

  return (
    <div className="settings-pane settings-pane--reminders reminders-view">
      <form className="reminders-view__create" onSubmit={create}>
        <input
          value={text}
          placeholder="New reminder"
          aria-label="New reminder"
          maxLength={MAX_REMINDER_CHARS}
          onChange={(event) => setText(event.target.value)}
        />
        <button className="btn-accent" type="submit" disabled={!text.trim()}>
          Add reminder
        </button>
      </form>
      <ul className="reminders-view__list">
        {reminders.map((reminder) => (
          <li key={reminder.id}>
            {rename.editingId === reminder.id ? (
              <input
                autoFocus
                value={rename.draft}
                aria-label="Reminder text"
                maxLength={MAX_REMINDER_CHARS}
                onChange={(event) => rename.setDraft(event.target.value)}
                onBlur={rename.commit}
                onKeyDown={(event) => {
                  if (event.key === "Enter") rename.commit();
                  if (event.key === "Escape") rename.cancel();
                }}
              />
            ) : (
              <button
                type="button"
                className="reminders-view__text"
                title="Edit reminder"
                onClick={() => rename.start(reminder.id, reminder.text)}
              >
                {reminder.text}
              </button>
            )}
            <button
              type="button"
              className={
                reminder.active
                  ? "reminders-view__active reminders-view__active--on"
                  : "reminders-view__active"
              }
              aria-pressed={reminder.active}
              title={
                reminder.active
                  ? "Active on the Greetings board"
                  : "Inactive — hidden from the Greetings board"
              }
              onClick={() => toggleActive(reminder.id, reminder.active)}
            >
              {reminder.active ? "Active" : "Inactive"}
            </button>
            <button
              type="button"
              className="reminders-view__delete"
              aria-label={`Delete ${reminder.text}`}
              onClick={() => remove(reminder.id, reminder.text)}
            >
              {trashIcon}
            </button>
          </li>
        ))}
      </ul>
      {reminders.length === 0 && (
        <p className="reminders-view__empty">No reminders yet.</p>
      )}
    </div>
  );
}
