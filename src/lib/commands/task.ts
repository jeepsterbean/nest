import { invoke } from "@tauri-apps/api/core";
import type {
  RatingValue,
  Task,
  TaskDependency,
  TaskStatus,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../types";
import { isTaskLocked, localDayStartSec } from "../taskLock";

export function listTasks(): Promise<Task[]> {
  return invoke("list_tasks");
}

export function listTaskDependencies(): Promise<TaskDependency[]> {
  return invoke("list_task_dependencies");
}

export function listTaskStatusEvents(
  from: number,
  to: number,
): Promise<TaskStatusEvent[]> {
  return invoke("list_task_status_events", { from, to });
}

export function createTask(
  title: string,
  description: string,
  status: TaskStatus,
  scope: string | null = null,
  parentTaskId: number | null = null,
): Promise<Task> {
  return invoke("create_task", {
    title,
    description,
    status,
    scope,
    parentTaskId,
  });
}

export function renameTask(id: number, title: string): Promise<Task> {
  return invoke("rename_task", { id, title });
}

export function setTaskDescription(
  id: number,
  description: string,
): Promise<Task> {
  return invoke("set_task_description", { id, description });
}

export function setTaskScope(id: number, scope: string | null): Promise<Task> {
  return invoke("set_task_scope", { id, scope });
}

export function setTaskParent(
  id: number,
  parentTaskId: number | null,
): Promise<Task> {
  return invoke("set_task_parent", { id, parentTaskId });
}

export function addTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("add_task_dependency", { blockerTaskId, blockedTaskId });
}

export function removeTaskDependency(
  blockerTaskId: number,
  blockedTaskId: number,
): Promise<void> {
  return invoke("remove_task_dependency", { blockerTaskId, blockedTaskId });
}

export function deleteTask(id: number): Promise<void> {
  return invoke("delete_task", { id });
}

/** The one way a status changes, so the lock holds for every caller. This
 * check spares a call on a Task already known to be locked; the backend
 * repeats it against the stored Task, since this copy can be stale. The
 * backend keeps no local day, so it is sent where today began. */
export function setTaskStatus(
  task: Pick<Task, "id" | "status" | "closedAt">,
  status: TaskStatus,
): Promise<Task> {
  const nowMs = Date.now();
  if (isTaskLocked(task, nowMs)) {
    return Promise.reject(
      new Error("This task closed on an earlier day, so its status is fixed."),
    );
  }
  return invoke("set_task_status", {
    id: task.id,
    status,
    dayStartedAt: localDayStartSec(nowMs),
  });
}

/** Offered once reopening is over: a Task closed today is reopened instead. */
export function createFollowUpTask(
  task: Pick<Task, "id" | "status" | "closedAt">,
): Promise<Task> {
  if (!isTaskLocked(task, Date.now())) {
    return Promise.reject(
      new Error("A follow-up is for a task closed on an earlier day."),
    );
  }
  return invoke("create_follow_up_task", { id: task.id });
}

export function setTaskWorking(id: number, working: boolean): Promise<Task> {
  return invoke("set_task_working", { id, working });
}

export function stopAllWorkingNow(): Promise<Task[]> {
  return invoke("stop_all_working_now");
}

export function listTaskWorkStretches(
  from: number,
  to: number,
): Promise<TaskWorkStretch[]> {
  return invoke("list_task_work_stretches", { from, to });
}

export function updateTaskWorkStretch(
  id: number,
  startedAt: number,
  endedAt: number | null,
): Promise<Task> {
  return invoke("update_task_work_stretch", { id, startedAt, endedAt });
}

export function deleteTaskWorkStretch(id: number): Promise<Task> {
  return invoke("delete_task_work_stretch", { id });
}

export function setTaskScore(
  id: number,
  value: RatingValue | null,
  effort: RatingValue | null,
): Promise<Task> {
  return invoke("set_task_score", { id, value, effort });
}

export function setTaskScoreField(
  id: number,
  field: "value" | "effort",
  score: RatingValue | null,
): Promise<Task> {
  return invoke("set_task_score_field", { id, field, score });
}

export function reorderTasks(ids: number[]): Promise<void> {
  return invoke("reorder_tasks", { ids });
}
