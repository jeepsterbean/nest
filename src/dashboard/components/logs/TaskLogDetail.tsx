import { Check, Plus, X } from "lucide-react";
import type { RecordedTaskStatus, Task } from "../../../lib/types";
import { taskChangeTaskId, taskTitle, type TaskChangeEvent } from "../../lib/logs";
import { TASK_STATUS_LABEL } from "../../lib/tasks";
import { StopMarkIcon } from "./workMarks";

function RecordedStatus({ status }: { status: RecordedTaskStatus }) {
  return (
    <span className="task-log__status">
      <span className={`status-dot status-dot--${status}`} aria-hidden="true" />
      {status === "paused" ? "Paused" : TASK_STATUS_LABEL[status]}
    </span>
  );
}

export function TaskLogDetail({ event, tasks }: { event: TaskChangeEvent; tasks: Task[] }) {
  const statusEvent = event.kind === "task-status" ? event.statusEvent : null;
  const taskId = taskChangeTaskId(event);
  const action = event.kind === "work-start" ? null
    : event.kind === "work-stop" ? "Stopped working"
    : statusEvent?.fromStatus === null ? null
    : statusEvent?.toStatus === "completed" ? "Completed task"
    : statusEvent?.toStatus === "cancelled" ? "Cancelled task"
    : null;
  const actionIcon = event.kind === "work-start" ? null
    : event.kind === "work-stop" ? <StopMarkIcon />
    : statusEvent?.fromStatus === null ? <Plus />
    : statusEvent?.toStatus === "completed" ? <Check />
    : statusEvent?.toStatus === "cancelled" ? <X />
    : null;
  const showStatuses = statusEvent !== null && statusEvent.fromStatus !== null;
  const title = taskTitle(tasks, taskId);

  return (
    <div className="log-detail task-log">
      {(actionIcon || action) && <span className="task-log__action">
        <span className="task-log__action-icon" aria-hidden="true">{actionIcon}</span>
        {action}
      </span>}
      {showStatuses && (
        <span className="task-log__statuses">
          <span className="task-log__separator" aria-hidden="true">·</span>
          {statusEvent.fromStatus !== null && (
            <>
              <RecordedStatus status={statusEvent.fromStatus} />
              <span className="task-log__separator" aria-label="to">→</span>
            </>
          )}
          <RecordedStatus status={statusEvent.toStatus} />
        </span>
      )}
      {(action || showStatuses) && <span className="task-log__separator" aria-hidden="true">—</span>}
      <span className="task-log__title" title={title}>{title}</span>
    </div>
  );
}
