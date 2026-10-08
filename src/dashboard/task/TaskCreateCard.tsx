import { useEffect, useState, type FormEvent } from "react";
import { createPortal } from "react-dom";
import {
  addTaskDependency,
  createTask,
  setTaskScore,
} from "../../lib/commands";
import type { RatingValue, Task, TaskStatus } from "../../lib/types";
import { MenuSelect, type MenuSelectOption } from "../components/MenuSelect";
import { xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { TASK_STATUS_LABEL, TASK_STATUSES } from "../lib/tasks";
import { RatingDotScale } from "./RatingDotScale";
import { taskSelectOptions } from "./taskSelectOptions";

export type TaskDraft = {
  title: string;
  description: string;
  status: TaskStatus;
  scope: string | null;
  parentTaskId: number | null;
  value: RatingValue | null;
  effort: RatingValue | null;
  blockerIds: number[];
};

export const EMPTY_TASK_DRAFT: TaskDraft = {
  title: "",
  description: "",
  status: "backlog",
  scope: null,
  parentTaskId: null,
  value: null,
  effort: null,
  blockerIds: [],
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
  const { tasks, scopeTree, reload, setError } = useDashboardData();
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
  const blockers = draft.blockerIds
    .map((id) => tasks.find((task) => task.id === id))
    .filter((task): task is Task => task !== undefined);
  const scopeOptions: MenuSelectOption[] = [
    { value: "", label: "No scope" },
    ...[...scopeTree.byPath.keys()]
      .sort((a, b) => a.localeCompare(b))
      .map((path) => ({ value: path, label: path })),
  ];

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
        draft.scope,
        draft.parentTaskId,
      );
      if (draft.value !== null || draft.effort !== null) {
        await setTaskScore(created.id, draft.value, draft.effort);
      }
      for (const blockerId of draft.blockerIds) {
        await addTaskDependency(blockerId, created.id);
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
              marker: <span className={`status-dot status-dot--${status}`} />,
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
          <div className="task-relation-field">
            <span className="task-relation-field__label">Scope</span>
            <MenuSelect
              value={draft.scope ?? ""}
              placeholder="No scope"
              ariaLabel="Scope"
              options={scopeOptions}
              onChange={(value) => update({ scope: value || null })}
            />
          </div>
          <div className="task-relation-field">
            <span className="task-relation-field__label">Parent</span>
            <MenuSelect
              value={draft.parentTaskId === null ? "" : String(draft.parentTaskId)}
              placeholder="No parent"
              ariaLabel="Parent"
              options={[
                { value: "", label: "No parent" },
                ...taskSelectOptions(tasks),
              ]}
              onChange={(value) =>
                update({ parentTaskId: value ? Number(value) : null })
              }
            />
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

        <div className="task-relation-group">
          <div className="task-relation-group__head">
            <span>Blocked by</span>
            {blockers.length > 0 && <span>{blockers.length}</span>}
          </div>
          {blockers.length > 0 && (
            <ul className="task-relation-list">
              {blockers.map((blocker) => (
                <li key={blocker.id}>
                  <span className={`status-dot status-dot--${blocker.status}`} />
                  <span>{blocker.title}</span>
                  <button
                    type="button"
                    className="task-relation-list__remove"
                    aria-label={`Remove ${blocker.title} as a blocker`}
                    title="Remove blocker"
                    onClick={() =>
                      update({
                        blockerIds: draft.blockerIds.filter(
                          (id) => id !== blocker.id,
                        ),
                      })
                    }
                  >
                    {xIcon}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MenuSelect
            className="task-relation-add"
            value=""
            placeholder="Add blocker…"
            ariaLabel="Add blocker"
            options={taskSelectOptions(
              tasks.filter((task) => !draft.blockerIds.includes(task.id)),
            )}
            onChange={(value) => {
              if (value) update({ blockerIds: [...draft.blockerIds, Number(value)] });
            }}
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
