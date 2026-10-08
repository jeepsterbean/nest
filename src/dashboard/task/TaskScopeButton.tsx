import type { Task } from "../../lib/types";
import { chevronDownIcon } from "../components/icons";
import { useTaskMenus } from "../context/TaskMenuContext";
import { scopeSegments } from "../lib/scope";

export function TaskScopeButton({
  task,
  display = "path",
  emptyLabel,
  showChevron = false,
}: {
  task: Task;
  display?: "leaf" | "path";
  /** Shown instead of the bare dot when the Task has no Scope. */
  emptyLabel?: string;
  showChevron?: boolean;
}) {
  const { scopeMenu, openScopeMenu } = useTaskMenus();
  const emptyClass = emptyLabel
    ? " task-card__scope--placeholder"
    : " task-card__scope--empty";
  return (
    <button
      type="button"
      className={`task-card__scope${task.scope ? "" : emptyClass}`}
      aria-haspopup="dialog"
      aria-expanded={scopeMenu?.taskId === task.id}
      aria-label={task.scope ? `Scope: ${task.scope}` : "Set task scope"}
      onClick={(e) => openScopeMenu(task, e.currentTarget)}
      title={task.scope ? `Scope: ${task.scope}` : "Set scope"}
    >
      {task.scope ? (
        (display === "leaf"
          ? scopeSegments(task.scope).slice(-1)
          : scopeSegments(task.scope)
        ).map((segment, index, segments) => (
          <span
            key={`${segment}-${index}`}
            className={
              index === segments.length - 1
                ? "task-card__scope-segment task-card__scope-segment--leaf"
                : "task-card__scope-segment"
            }
          >
            {segment}
          </span>
        ))
      ) : emptyLabel ? (
        emptyLabel
      ) : (
        <span className="task-card__scope-dot" aria-hidden="true" />
      )}
      {showChevron && (
        <span className="task-card__scope-chevron" aria-hidden="true">
          {chevronDownIcon}
        </span>
      )}
    </button>
  );
}
