import { useMemo, useRef } from "react";
import { setTaskParent } from "../../lib/commands";
import type { Task } from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { plusIcon } from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { ancestorIds, descendantIds } from "../lib/taskGraph";
import { CLOSED_STATUSES } from "../lib/tasks";
import { taskSelectOptions } from "./taskSelectOptions";
import { StatusTrigger } from "./StatusTrigger";

/** Parent and Children relationships. */
export function TaskRelations({ task, onCreateRelated, onOpenTask }: {
  task: Task;
  onOpenTask: (taskId: number) => void;
  onCreateRelated: (direction: "parent" | "child", origin: HTMLElement) => void;
}) {
  const sectionRef = useRef<HTMLElement>(null);
  const { tasks, taskGraph, mutate } = useDashboardData();

  const children = taskGraph.childrenByParent.get(task.id) ?? [];
  const parent = task.parentTaskId === null ? undefined : taskGraph.byId.get(task.parentTaskId);
  const parents = parent ? [parent] : [];

  const descendants = useMemo(
    () => descendantIds(taskGraph, task.id),
    [taskGraph, task.id],
  );
  const parentCandidates = tasks.filter((candidate) =>
    candidate.id !== task.id &&
    !descendants.has(candidate.id) &&
    task.parentTaskId !== candidate.id,
  );
  const ancestors = useMemo(
    () => ancestorIds(taskGraph, task.id),
    [taskGraph, task.id],
  );
  const childCandidates = tasks.filter((candidate) =>
    candidate.id !== task.id &&
    candidate.parentTaskId !== task.id &&
    !ancestors.has(candidate.id),
  );
  return (
    <section ref={sectionRef} className="task-relations" aria-label={`Relations for ${task.title}`}>
      <h3 className="task-relations__title">Relationships</h3>
      {([
        { direction: "parent", label: "Parent", related: parents, candidates: parentCandidates },
        { direction: "child", label: "Children", related: children, candidates: childCandidates },
      ] as const).map(({ direction, label, related, candidates }) => (
        <section className="task-relations__group" key={direction} data-relation={direction} aria-label={label}>
          <header className="task-relations__head">
            <h4>{label}</h4>
            <span className="task-relations__count">
              {related.filter((item) => !CLOSED_STATUSES.includes(item.status)).length}/{related.length} open
            </span>
            <MenuSelect
              className="task-relations__add"
              value=""
              placeholder="+"
              triggerContent={plusIcon}
              ariaLabel={`Link ${direction} to ${task.title}`}
              menuMinWidth={240}
              searchPlaceholder="Find a task…"
              options={[
                { value: "create", label: "Create new task", marker: plusIcon },
                ...taskSelectOptions(candidates),
              ]}
              onChange={(value) => {
                if (value === "create") {
                  const origin = sectionRef.current?.querySelector<HTMLButtonElement>(
                    `[data-relation="${direction}"] .menu-select__trigger`,
                  );
                  if (origin) onCreateRelated(direction, origin);
                } else {
                  const id = Number(value);
                  void mutate(() => direction === "parent"
                    ? setTaskParent(task.id, id)
                    : setTaskParent(id, task.id));
                }
              }}
            />
          </header>
          {related.length > 0 && (
            <ul className="task-relation-list">
              {related.map((item) => (
                <li key={item.id}>
                  <StatusTrigger task={item} compact />
                  <button
                    type="button"
                    className="task-relation-open"
                    title={item.title}
                    onClick={() => onOpenTask(item.id)}
                  >
                    {item.title}
                  </button>
                  <button
                    type="button"
                    className="task-relation-remove"
                    aria-label={`Unlink ${direction} ${item.title}`}
                    title="Unlink"
                    onClick={() => {
                      void mutate(() => direction === "parent"
                        ? setTaskParent(task.id, null)
                        : setTaskParent(item.id, null));
                    }}
                  >
                    Unlink
                  </button>
                </li>
              ))}
            </ul>
          )}
        </section>
      ))}
    </section>
  );
}
