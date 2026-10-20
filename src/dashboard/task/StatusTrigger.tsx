import { useId } from "react";
import { isTaskLocked } from "../../lib/taskLock";
import type { Task } from "../../lib/types";
import { chevronDownIcon } from "../components/icons";
import { useTaskMenus } from "../context/TaskMenuContext";
import { TaskStatusIcon } from "./TaskStatusIcon";
import { TASK_STATUS_LABEL } from "../lib/tasks";

export function StatusTrigger({
  task,
  compact = false,
  showIcon = true,
}: {
  task: Task;
  // Compact drops the label to dot + chevron for tight spots where the
  // surroundings already name the status.
  compact?: boolean;
  showIcon?: boolean;
}) {
  const { statusMenu, openStatusMenu } = useTaskMenus();
  const anchorId = useId();
  const open = statusMenu?.anchorId === anchorId;
  return (
    <button
      type="button"
      className={`task-status-trigger task-status-trigger--${task.status}${
        compact ? " task-status-trigger--compact" : ""
      }`}
      aria-haspopup={isTaskLocked(task, Date.now()) ? "menu" : "listbox"}
      aria-expanded={open}
      aria-label={`Status for ${task.title}: ${TASK_STATUS_LABEL[task.status]}`}
      title={compact ? TASK_STATUS_LABEL[task.status] : undefined}
      onClick={(e) => openStatusMenu(task, e.currentTarget, anchorId)}
    >
      {showIcon && <TaskStatusIcon status={task.status} />}
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
