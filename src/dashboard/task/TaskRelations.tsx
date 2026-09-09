import { useMemo, useState, type FormEvent } from "react";
import {
  addTaskDependency,
  createTask,
  removeTaskDependency,
  setTaskParent,
} from "../../lib/commands";
import type { Task } from "../../lib/types";
import { MenuSelect, type MenuSelectOption } from "../components/MenuSelect";
import { xIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  childProgress,
  descendantIds,
  isTaskBlocked,
  unresolvedBlockers,
} from "../lib/taskGraph";

const byTitle = (a: Task, b: Task) => a.title.localeCompare(b.title);

export function TaskRelations({ task }: { task: Task }) {
  const { tasks, taskGraph, mutate } = useDashboardData();
  const [childTitle, setChildTitle] = useState("");

  const children = taskGraph.childrenByParent.get(task.id) ?? [];
  const blockers = taskGraph.blockersByTask.get(task.id) ?? [];
  const dependents = taskGraph.dependentsByTask.get(task.id) ?? [];
  const parent =
    task.parentTaskId === null ? null : taskGraph.byId.get(task.parentTaskId) ?? null;
  const progress = childProgress(taskGraph, task.id);
  const unresolved = unresolvedBlockers(taskGraph, task.id);
  const blocked = isTaskBlocked(taskGraph, task.id);

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
    <section className="task-relations" aria-label={`Structure for ${task.title}`}>
      <div className="task-relations__heading">
        <span>Structure</span>
        <span
          className={`task-readiness${blocked ? " task-readiness--blocked" : ""}`}
          title={
            blocked
              ? `Waiting for ${unresolved.map((value) => value.title).join(", ")}`
              : "No incomplete blockers"
          }
        >
          <span className="task-readiness__dot" aria-hidden="true" />
          {blocked ? `${unresolved.length} blocking` : "Ready"}
        </span>
      </div>

      <div className="task-relation-field">
        <span className="task-relation-field__label">Parent</span>
        <MenuSelect
          value={parent ? String(parent.id) : ""}
          placeholder="No parent"
          ariaLabel={`Parent for ${task.title}`}
          options={[
            { value: "", label: "No parent" },
            ...taskOptions(parentCandidates),
          ]}
          onChange={(value) => {
            void mutate(() =>
              setTaskParent(task.id, value ? Number(value) : null),
            );
          }}
        />
      </div>

      <div className="task-relation-group">
        <div className="task-relation-group__head">
          <span>Children</span>
          {progress.total > 0 && (
            <span>{progress.completed}/{progress.total} complete</span>
          )}
        </div>
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
            placeholder="Add a child task…"
            aria-label={`New child of ${task.title}`}
            onChange={(event) => setChildTitle(event.target.value)}
          />
          <button type="submit" disabled={!childTitle.trim()}>
            Add
          </button>
        </form>
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
          className="task-relation-add"
          value=""
          placeholder="Add blocker…"
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

      {dependents.length > 0 && (
        <div className="task-relation-group task-relation-group--dependents">
          <div className="task-relation-group__head">
            <span>Blocks</span>
            <span>{dependents.length}</span>
          </div>
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
