import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  createTask,
  addTaskParent,
  setTaskScore,
} from "../../lib/commands";
import type { RatingValue, Task, TaskStatus } from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { ancestorIds } from "../lib/taskGraph";
import { TASK_STATUS_LABEL, TASK_STATUSES } from "../lib/tasks";
import { RatingDotScale } from "./RatingDotScale";
import { taskSelectOptions } from "./taskSelectOptions";
import { TaskStatusIcon } from "./TaskStatusIcon";

export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  parentTaskIds: number[];
  childTaskIds: number[];
  value: RatingValue | null;
  effort: RatingValue | null;
};

export const EMPTY_TASK_DRAFT: TaskDraft = {
  title: "",
  description: "",
  status: "backlog",
  parentTaskIds: [],
  childTaskIds: [],
  value: null,
  effort: null,
};

// The draft lives in the caller so a click-away keeps what was typed for the
// next open; only a successful add clears it.
export function TaskCreateCard({
  draft,
  onDraftChange,
  onClose,
  onCreated,
}: {
  draft: TaskDraft;
  onDraftChange: (draft: TaskDraft) => void;
  onClose: () => void;
  onCreated: (task: Task) => void;
}) {
  const { tasks, taskGraph, reload, setError } = useDashboardData();
  const [saving, setSaving] = useState(false);
  const update = (patch: Partial<TaskDraft>) =>
    onDraftChange({ ...draft, ...patch });

  // MenuSelect claims Escape first (preventDefault) while one of its menus is
  // open, so Escape only closes the card once no menu is showing.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape" || e.defaultPrevented) return;
      e.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  const title = draft.title.trim();
  // The draft outlives the card, so a Parent deleted in the meantime is
  // dropped here instead of failing the whole create.
  const parents = draft.parentTaskIds.flatMap((id) => {
    const parent = tasks.find((task) => task.id === id);
    return parent ? [parent] : [];
  });
  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (!title || saving) return;
    setSaving(true);
    let created: Task | null = null;
    try {
      created = await createTask(
        title,
        draft.description.trim(),
        draft.status,
        parents.map((parent) => parent.id),
      );
      for (const childId of draft.childTaskIds) {
        if (tasks.some((task) => task.id === childId)) {
          await addTaskParent(childId, created.id);
        }
      }
      if (draft.value !== null || draft.effort !== null) {
        await setTaskScore(created.id, draft.value, draft.effort);
      }
    } catch (error) {
      setError(String(error));
    } finally {
      // Reload even after a partial failure so a Task that was created shows up.
      await reload();
      setSaving(false);
    }
    if (created) onCreated(created);
  };

  return createPortal(
    <div
      className="task-create-overlay"
      onMouseDown={(e) => {
        // MenuSelect portals its menus here in the React tree, so their
        // events bubble through; only a press on the scrim itself dismisses.
        if (e.target === e.currentTarget) onClose();
      }}
    >
      <form
        className="task-create-card"
        role="dialog"
        aria-modal="true"
        aria-label="New task"
        onSubmit={submit}
      >
        <header className="task-create-card__head">
          <MenuSelect
            className="task-create-card__status"
            value={draft.status}
            placeholder="Status"
            ariaLabel="Status"
            options={TASK_STATUSES.map((status) => ({
              value: status,
              label: TASK_STATUS_LABEL[status],
              marker: <TaskStatusIcon status={status} />,
            }))}
            onChange={(value) => update({ status: value as TaskStatus })}
          />
          <button
            type="button"
            className="task-detail__close"
            aria-label="Close"
            title="Close"
            onClick={onClose}
          >
            {xIcon}
          </button>
        </header>

        <input
          className="task-create-card__title"
          value={draft.title}
          autoFocus
          placeholder="Task name"
          aria-label="Task name"
          aria-required="true"
          onChange={(e) => update({ title: e.target.value })}
        />
        <textarea
          className="task-create-card__description"
          value={draft.description}
          rows={3}
          placeholder="Description"
          aria-label="Description"
          onChange={(e) => update({ description: e.target.value })}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
              e.preventDefault();
              e.currentTarget.form?.requestSubmit();
            }
          }}
        />

        <div className="task-create-card__fields">
          {draft.childTaskIds.length > 0 && (
            <div className="task-relation-field">
              <span className="task-relation-field__label">Children</span>
              <ul className="task-relation-list">
                {tasks.filter((task) => draft.childTaskIds.includes(task.id)).map((child) => (
                  <li key={child.id}>
                    <TaskStatusIcon status={child.status} />
                    <span>{child.title}</span>
                    <button type="button" className="task-relation-remove"
                      aria-label={`Unlink child ${child.title}`}
                      onClick={() => update({ childTaskIds: draft.childTaskIds.filter((id) => id !== child.id) })}>
                      Unlink
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          )}

          <div className="task-relation-field">
            <span className="task-relation-field__label">Parents</span>
            <div className="task-detail__stack">
              {parents.length > 0 && (
                <ul className="task-relation-list">
                  {parents.map((parent) => (
                    <li key={parent.id}>
                      <TaskStatusIcon status={parent.status} />
                      <span>{parent.title}</span>
                      <button
                        type="button"
                        className="task-relation-remove"
                        aria-label={`Unlink parent ${parent.title}`}
                        onClick={() => update({ parentTaskIds: draft.parentTaskIds.filter((parentId) => parentId !== parent.id) })}
                      >
                        Unlink
                      </button>
                    </li>
                  ))}
                </ul>
              )}
              <MenuSelect
                value=""
                placeholder={parents.length > 0 ? "Add parent…" : "No parents"}
                ariaLabel="Add parent"
                searchPlaceholder="Find a parent…"
                options={taskSelectOptions(tasks.filter((task) => !draft.parentTaskIds.includes(task.id) && !draft.childTaskIds.some((id) => id === task.id || ancestorIds(taskGraph, task.id).has(id))))}
                onChange={(value) => update({ parentTaskIds: [...draft.parentTaskIds, Number(value)] })}
              />
            </div>
          </div>
        </div>

        <div className="task-score" role="group" aria-label="Priority scores">
          <RatingDotScale
            kind="value"
            label="Value"
            ariaLabel="Value"
            current={draft.value}
            onChange={(value) => update({ value })}
          />
          <RatingDotScale
            kind="effort"
            label="Effort"
            ariaLabel="Effort"
            current={draft.effort}
            onChange={(effort) => update({ effort })}
          />
        </div>

        <footer className="task-create-card__footer">
          <button
            type="button"
            className="task-create-card__cancel"
            onClick={onClose}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn-accent task-create-card__submit"
            disabled={!title || saving}
          >
            Add task
          </button>
        </footer>
      </form>
    </div>,
    document.querySelector(".dashboard") ?? document.body,
  );
}
