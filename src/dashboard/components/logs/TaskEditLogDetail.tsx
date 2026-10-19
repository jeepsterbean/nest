import type { Task, TaskEditEvent } from "../../../lib/types";
import { taskTitle } from "../../lib/logs";
import { TASK_UPDATE_LABEL, taskUpdateDetail } from "../../lib/taskUpdates";

export function TaskEditLogDetail({ event, tasks }: { event: TaskEditEvent; tasks: Task[] }) {
  const title = taskTitle(tasks, event.taskId);
  const detail = taskUpdateDetail(event.update);
  return (
    <div className="log-detail task-log">
      <span className="task-log__title" title={title}>{title}</span>
      <span className="task-log__separator" aria-hidden="true">—</span>
      <span className="task-log__status">{TASK_UPDATE_LABEL[event.update.kind]}</span>
      {detail !== null && <span className="task-log__detail">{detail}</span>}
    </div>
  );
}
