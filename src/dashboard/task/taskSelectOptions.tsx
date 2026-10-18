import type { Task } from "../../lib/types";
import type { MenuSelectOption } from "../components/MenuSelect";
import { taskRelationshipCandidates } from "../lib/taskRelationshipCandidates";
import { TaskStatusIcon } from "./TaskStatusIcon";

/** Relationship picker options, newest first; older closed Tasks appear only in search. */
export const taskSelectOptions = (tasks: Task[]): MenuSelectOption[] =>
  // The seven-day window needs only day precision, so render time is close enough.
  taskRelationshipCandidates(tasks, Date.now())
    .map(({ task, searchOnly }) => ({
      value: String(task.id),
      label: task.title,
      searchOnly,
      marker: <TaskStatusIcon status={task.status} />,
    }));
