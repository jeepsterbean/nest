import type { Task } from "../../lib/types";
import type { MenuSelectOption } from "../components/MenuSelect";

/** Alphabetical Task options for Parent pickers. */
export const taskSelectOptions = (tasks: Task[]): MenuSelectOption[] =>
  [...tasks]
    .sort((left, right) => left.title.localeCompare(right.title))
    .map((task) => ({
      value: String(task.id),
      label: task.title,
      marker: <span className={`status-dot status-dot--${task.status}`} />,
    }));
