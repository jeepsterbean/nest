import { useMemo, useState, type FormEvent } from "react";
import {
  addTaskDependency,
  createTask,
  removeTaskDependency,
  setTaskParent,
} from "../../lib/commands";
import type { Task } from "../../lib/types";
import { MenuSelect, type MenuSelectOption } from "../components/MenuSelect";
import { enterIcon, xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { childProgress, descendantIds } from "../lib/taskGraph";

const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title);

/** Parent, Children, Blocker and Dependent rows of the detail panel. Readiness
 * has no badge: each Blocker row's status dot shows whether it is done. */
export function TaskRelations({ task }: { task: Task }) {
  const { tasks, taskGraph, mutate } = useDashboardData();
  const [childTitle, setChildTitle] = useState("");

  const children = taskGraph.childrenByParent.get(task.id) ?? [];
  const blockers = taskGraph.blockersByTask.get(task.id) ?? [];
  const dependents = taskGraph.dependentsByTask.get(task.id) ?? [];
  const parent =
    task.parentTaskId === null ? null : taskGraph.byId.get(task.parentTaskId) ?? null;
  const progress = childProgress(taskGraph, task.id);

  const descendants = useMemo(
    () => descendantIds(taskGraph, task.id),
    [taskGraph, task.id],
  );
  const parentCandidates = tasks
    .filter((candidate) => candidate.id !== task.id && !descendants.has(candidate.id))
    .sort(byTitle);
  const blockerIds = new Set(blockers.map((blocker) => blocker.id));
  const blockerCandidates = tasks
    .filter((candidate) => candidate.id !== task.id && !blockerIds.has(candidate.id))
    .sort(byTitle);
  const taskOptions = (candidates: Task[]): MenuSelectOption[] =>
    candidates.map((candidate) => ({
      value: String(candidate.id),
      label: candidate.title,
      marker: <span className={`status-dot status-dot--${candidate.status}`} />,
    }));

  const addChild = (event: FormEvent) => {
    event.preventDefault();
    const title = childTitle.trim();
    if (!title) return;
    void mutate(() => createTask(title, "", "backlog", task.scope, task.id)).then(
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
          // The clearing option is offered only while a Parent is set, so an
          // unset Parent renders as the muted placeholder, not a chosen value.
          options={[
            ...(parent ? [{ value: "", label: "No parent" }] : []),
            ...taskOptions(parentCandidates),
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
                </li>
              ))}
            </ul>
          )}
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

      <div className="task-detail__field">
        <span className="task-detail__label">Blocked by</span>
        <div className="task-detail__stack">
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
                      void mutate(() => removeTaskDependency(blocker.id, task.id))
                    }
                  >
                    {xIcon}
                  </button>
                </li>
              ))}
            </ul>
          )}
          <MenuSelect
            value=""
            placeholder={blockers.length > 0 ? "Add blocker…" : "No blockers"}
            ariaLabel={`Add blocker for ${task.title}`}
            options={taskOptions(blockerCandidates)}
            onChange={(value) => {
              if (!value) return;
              void mutate(() =>
                addTaskDependency(Number(value), task.id),
              );
            }}
          />
        </div>
      </div>

      {dependents.length > 0 && (
        <div className="task-detail__field">
          <span className="task-detail__label">Blocks</span>
          <ul className="task-relation-list">
            {dependents.map((dependent) => (
              <li key={dependent.id}>
                <span className={`status-dot status-dot--${dependent.status}`} />
                <span>{dependent.title}</span>
              </li>
            ))}
          </ul>
        </div>
      )}
    </section>
  );
}
