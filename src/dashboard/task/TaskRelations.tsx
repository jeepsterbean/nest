import { useMemo, useState, type FormEvent } from "react";
import {
  createTask,
  setTaskParent,
} from "../../lib/commands";
import type { Task } from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { enterIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { ancestorIds, childProgress, descendantIds } from "../lib/taskGraph";
import { taskSelectOptions } from "./taskSelectOptions";

/** Parent and Children relationships. */
export function TaskRelations({ task }: { task: Task }) {
  const { tasks, taskGraph, mutate } = useDashboardData();
  const [childTitle, setChildTitle] = useState("");

  const children = taskGraph.childrenByParent.get(task.id) ?? [];
  const parent =
    task.parentTaskId === null ? null : taskGraph.byId.get(task.parentTaskId) ?? null;
  const progress = childProgress(taskGraph, task.id);

  const descendants = useMemo(
    () => descendantIds(taskGraph, task.id),
    [taskGraph, task.id],
  );
  const parentCandidates = tasks
    .filter((candidate) => candidate.id !== task.id && !descendants.has(candidate.id));
  const ancestors = useMemo(
    () => ancestorIds(taskGraph, task.id),
    [taskGraph, task.id],
  );
  const childCandidates = tasks.filter((candidate) =>
    candidate.id !== task.id &&
    candidate.parentTaskId !== task.id &&
    !ancestors.has(candidate.id),
  );
  const addChild = (event: FormEvent) => {
    event.preventDefault();
    const title = childTitle.trim();
    if (!title) return;
    void mutate(() => createTask(title, "", "backlog", task.id)).then(
      (created) => {
        if (created) setChildTitle("");
      },
    );
  };

  return (
    <section className="task-relations" aria-label={`Relations for ${task.title}`}>
      <div className="task-detail__field">
        <span className="task-detail__label">Parent</span>
        <MenuSelect
          value={parent ? String(parent.id) : ""}
          placeholder="No parent"
          ariaLabel={`Parent for ${task.title}`}
          searchPlaceholder="Find a parent…"
          // The clearing option is offered only while a Parent is set, so an
          // unset Parent renders as the muted placeholder, not a chosen value.
          options={[
            ...(parent ? [{ value: "", label: "No parent" }] : []),
            ...taskSelectOptions(parentCandidates, task.parentTaskId),
          ]}
          onChange={(value) => {
            void mutate(() =>
              setTaskParent(task.id, value ? Number(value) : null),
            );
          }}
        />
      </div>

      <div className="task-detail__field">
        <span className="task-detail__label">
          Children
          {progress.total > 0 && (
            <span
              className="task-detail__label-count"
              title={`${progress.completed} of ${progress.total} complete`}
            >
              {progress.completed}/{progress.total}
            </span>
          )}
        </span>
        <div className="task-detail__stack">
          {children.length > 0 && (
            <ul className="task-relation-list">
              {children.map((child) => (
                <li key={child.id}>
                  <span className={`status-dot status-dot--${child.status}`} />
                  <span>{child.title}</span>
                  <button
                    type="button"
                    className="task-relation-remove"
                    aria-label={`Unlink ${child.title}`}
                    title="Unlink"
                    onClick={() => {
                      void mutate(() => setTaskParent(child.id, null));
                    }}
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MenuSelect
            value=""
            placeholder="Link existing child…"
            ariaLabel={`Link existing child to ${task.title}`}
            searchPlaceholder="Find a task…"
            options={taskSelectOptions(childCandidates)}
            onChange={(value) => {
              void mutate(() => setTaskParent(Number(value), task.id));
            }}
          />
          <form className="task-child-create" onSubmit={addChild}>
            <input
              value={childTitle}
              placeholder={children.length > 0 ? "Add child…" : "No children"}
              aria-label={`New child of ${task.title}`}
              onChange={(event) => setChildTitle(event.target.value)}
            />
            <button
              type="submit"
              aria-label="Add child task"
              title="Add child task"
              disabled={!childTitle.trim()}
            >
              {enterIcon}
            </button>
          </form>
        </div>
      </div>
    </section>
  );
}
