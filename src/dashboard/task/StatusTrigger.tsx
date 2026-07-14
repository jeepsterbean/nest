import type { Task } from "../../lib/types";
import { useTaskMenus } from "../context/TaskMenuContext";
import { TASK_STATUS_LABEL } from "../lib/tasks";

export function StatusTrigger({ task }: { task: Task }) {
  const { statusMenu, openStatusMenu } = useTaskMenus();
  const open = statusMenu?.taskId === task.id;
  return (
    <button
      type="button"
      className={`task-status-trigger task-status-trigger--${task.status}`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`Status for ${task.title}`}
      onClick={(e) => openStatusMenu(task, e.currentTarget)}
    >
      <span
        className={`status-dot status-dot--${task.status}`}
        aria-hidden="true"
      />
      <span className="task-status-trigger__label">
        {TASK_STATUS_LABEL[task.status]}
      </span>
      <span className="task-status-trigger__chevron" aria-hidden="true">
        ▾
      </span>
    </button>
  );
}
