import type { Task } from "../../lib/types";
import type { MenuSelectOption } from "../components/MenuSelect";
import { taskRelationshipCandidates } from "../lib/taskRelationshipCandidates";
import { TASK_STATUS_LABEL } from "../lib/tasks";

/** Relationship picker options, newest first; older closed Tasks appear only in search. */
export const taskSelectOptions = (tasks: Task[], selectedId: number | null = null): MenuSelectOption[] =>
  // The seven-day window needs only day precision, so render time is close enough.
  taskRelationshipCandidates(tasks, selectedId, Date.now())
    .map(({ task, searchOnly }) => ({
      value: String(task.id),
      label: task.title,
      searchOnly,
      description: TASK_STATUS_LABEL[task.status],
      marker: <span className={`status-dot status-dot--${task.status}`} />,
    }));
