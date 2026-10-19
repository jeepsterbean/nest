import { taskDateFilterLabel } from "./taskDateFilter";
import { taskScoreFilterLabel } from "./taskScoreFilter";
import { matchingTaskStatusPreset, taskStatusFilterLabel } from "./tasks";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableFilterField, type TaskTableQuery } from "./taskTableViews";
import { taskWorkedTimeFilterLabel } from "./taskWorkedTimeFilter";

/** Sidebar order, which the add menu also follows. */
export const TASK_TABLE_FILTERS: readonly { field: TaskTableFilterField; name: string; unsetLabel: string }[] = [
  { field: "workedOn", name: "Worked on", unsetLabel: "-" },
  { field: "statusChanged", name: "Status changed", unsetLabel: "-" },
  { field: "statuses", name: "Status", unsetLabel: "All statuses" },
  { field: "parent", name: "Parent", unsetLabel: "All parents" },
  { field: "created", name: "Created", unsetLabel: "-" },
  { field: "updated", name: "Updated", unsetLabel: "-" },
  { field: "closed", name: "Closed", unsetLabel: "-" },
  { field: "value", name: "Value", unsetLabel: "All" },
  { field: "effort", name: "Effort", unsetLabel: "All" },
  { field: "workedTime", name: "Worked time", unsetLabel: "Any" },
];

/** Short rule copy for an active filter, or null when the field selects every Task. */
export const taskTableFilterLabel = (
  field: TaskTableFilterField,
  query: TaskTableQuery,
  taskTitle: (id: number) => string | undefined,
  nowMs: number,
): string | null => {
  switch (field) {
    case "statuses":
      return matchingTaskStatusPreset(query.statuses) === "all" ? null : taskStatusFilterLabel(query.statuses);
    case "parent":
      return query.parent === null ? null : query.parent === "none" ? "No parent" : taskTitle(query.parent) ?? "Parent";
    case "created":
    case "updated":
    case "closed":
    case "workedOn":
    case "statusChanged":
      return taskDateFilterLabel(query[field], nowMs);
    case "value":
    case "effort":
      return taskScoreFilterLabel(query[field]);
    case "workedTime":
      return taskWorkedTimeFilterLabel(query.workedTime);
  }
};

export const clearedTaskTableFilter = (field: TaskTableFilterField): Partial<TaskTableQuery> =>
  ({ [field]: DEFAULT_TASK_TABLE_QUERY[field] });
