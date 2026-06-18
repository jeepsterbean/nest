import { useState } from "react";
import { setTaskDescription } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";

export function TaskDescription({ task }: { task: Task }) {
  const { mutate } = useDashboardData();
  const [editingId, setEditingId] = useState<number | null>(null);
  const [draft, setDraft] = useState("");

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

  return editingId === task.id ? (
    <textarea
      className="task-card__description-input"
      value={draft}
      autoFocus
      rows={3}
      placeholder="Add a description…"
      onChange={(e) => setDraft(e.target.value)}
      onBlur={commit}
      onKeyDown={(e) => {
        if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
          e.preventDefault();
          commit();
        }
        if (e.key === "Escape") setEditingId(null);
      }}
    />
  ) : (
    <button
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
