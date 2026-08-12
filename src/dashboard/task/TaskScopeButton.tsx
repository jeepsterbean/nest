import type { Task } from "../../lib/types";
import { useTaskMenus } from "../context/TaskMenuContext";
import { scopeSegments } from "../lib/scope";

export function TaskScopeButton({
  task,
  display = "path",
}: {
  task: Task;
  display?: "leaf" | "path";
}) {
  const { scopeMenu, openScopeMenu } = useTaskMenus();
  return (
    <button
      type="button"
      className={
        task.scope
          ? "task-card__scope"
          : "task-card__scope task-card__scope--empty"
      }
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
      ) : (
        <span className="task-card__scope-dot" aria-hidden="true" />
      )}
    </button>
  );
}
