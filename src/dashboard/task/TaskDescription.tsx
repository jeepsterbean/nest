import { useEffect, useRef, useState } from "react";
import { setTaskDescription } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";

/**
 * In-place description editor for the Task detail panel. Enter saves and
 * Shift+Enter breaks the line. The detail panel bounds the writing area.
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
      ref={inputRef}
      className="task-card__description-input"
      value={draft}
      autoFocus
      rows={1}
      aria-label="Description"
      placeholder="Add a description…"
      onChange={(e) => setDraft(e.target.value)}
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
      {task.description || "Add a description…"}
    </button>
  );
}
