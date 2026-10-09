import type { RecordedTaskStatus, Task } from "../../../lib/types";
import { taskChangeTaskId, taskTitle, type TaskChangeEvent } from "../../lib/logs";

const STATUS_ACTIVITY_LABEL: Record<RecordedTaskStatus, string> = {
  backlog: "Moved to Backlog",
  up_next: "Moved to Up next",
  active: "Moved to Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

function taskActivityLabel(event: TaskChangeEvent): string {
  if (event.kind === "work-start") return "Started";
  if (event.kind === "work-stop") return "Paused";
  const { fromStatus, toStatus } = event.statusEvent;
  if (fromStatus === null) return "Added";
  if ((fromStatus === "completed" || fromStatus === "cancelled")
    && (toStatus === "backlog" || toStatus === "up_next" || toStatus === "active")) {
    return `Reopened to ${toStatus === "backlog" ? "Backlog" : toStatus === "up_next" ? "Up next" : "Active"}`;
  }
  return STATUS_ACTIVITY_LABEL[toStatus];
}

export function TaskLogDetail({ event, tasks }: { event: TaskChangeEvent; tasks: Task[] }) {
  const title = taskTitle(tasks, taskChangeTaskId(event));

  return (
    <div className="log-detail task-log">
      <span className="task-log__title" title={title}>{title}</span>
      <span className="task-log__separator" aria-hidden="true">—</span>
      <span className="task-log__status">{taskActivityLabel(event)}</span>
    </div>
  );
}
