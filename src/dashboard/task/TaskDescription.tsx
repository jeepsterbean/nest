import { useEffect, useRef, useState } from "react";
import { setTaskDescription } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";

/**
 * In-place description editor for the Task detail panel. Enter saves and
 * Shift+Enter breaks the line. It grows with its text up to a maximum height.
 */
export function TaskDescription({ task }: { task: Task }) {
  const { mutate } = useDashboardData();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const displayRef = useRef<HTMLButtonElement>(null);
  // Set only by keyboard exits; a blur save must leave focus where it went.
  const refocusDisplayRef = useRef(false);
  const editing = editingId === task.id;

  // Grows with the text; the stylesheet's max-height takes over with a scrollbar.
  const fitToContent = (input: HTMLTextAreaElement | null) => {
    if (!input) return;
    input.style.height = "auto";
    input.style.height = `${input.scrollHeight}px`;
  };

  useEffect(() => {
    if (editing || !refocusDisplayRef.current) return;
    refocusDisplayRef.current = false;
    displayRef.current?.focus();
  }, [editing]);

  const start = () => {
    setEditingId(task.id);
    setDraft(task.description);
  };

  const commit = () => {
    if (editingId === null) return;
    setEditingId(null);
    const next = draft.trim();
    if (next === task.description) return;
    void mutate(() => setTaskDescription(task.id, next));
  };

  return editing ? (
    <textarea
      ref={(input) => {
        inputRef.current = input;
        fitToContent(input);
      }}
      className="task-card__description-input"
      value={draft}
      autoFocus
      aria-label="Description"
      placeholder="Add description…"
      onChange={(e) => {
        setDraft(e.target.value);
        fitToContent(e.target);
      }}
      onBlur={commit}
      onKeyDown={(e) => {
        if (
          e.key === "Enter" &&
          !e.shiftKey &&
          !e.nativeEvent.isComposing
        ) {
          e.preventDefault();
          refocusDisplayRef.current = true;
          commit();
        }
        if (e.key === "Escape") {
          refocusDisplayRef.current = true;
          setEditingId(null);
        }
      }}
    />
  ) : (
    <button
      ref={displayRef}
      type="button"
      className={
        task.description
          ? "task-card__description"
          : "task-card__description task-card__description--empty"
      }
      onClick={start}
      title="Click to edit description"
    >
      {task.description || "Add description…"}
    </button>
  );
}
