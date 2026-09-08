import type { Task } from "../../lib/types";
import { chevronDownIcon } from "../components/icons";
import { useTaskMenus } from "../context/TaskMenuContext";
import { TASK_STATUS_LABEL } from "../lib/tasks";

export function StatusTrigger({
  task,
  compact = false,
}: {
  task: Task;
  // Compact drops the label to dot + chevron for tight spots where the
  // surroundings already name the status.
  compact?: boolean;
}) {
  const { statusMenu, openStatusMenu } = useTaskMenus();
  const open = statusMenu?.taskId === task.id;
  return (
    <button
      type="button"
      className={`task-status-trigger task-status-trigger--${task.status}${
        compact ? " task-status-trigger--compact" : ""
      }`}
      aria-haspopup="listbox"
      aria-expanded={open}
      aria-label={`Status for ${task.title}: ${TASK_STATUS_LABEL[task.status]}`}
      title={compact ? TASK_STATUS_LABEL[task.status] : undefined}
      onClick={(e) => openStatusMenu(task, e.currentTarget)}
    >
      <span
        className={`status-dot status-dot--${task.status}`}
        aria-hidden="true"
      />
      {!compact && (
        <span className="task-status-trigger__label">
          {TASK_STATUS_LABEL[task.status]}
        </span>
      )}
      <span className="task-status-trigger__chevron" aria-hidden="true">
        {chevronDownIcon}
      </span>
    </button>
  );
}
