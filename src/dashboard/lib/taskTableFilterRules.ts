import { taskDateFilterLabel } from "./taskDateFilter";
import { taskScoreFilterLabel } from "./taskScoreFilter";
import { matchingTaskStatusPreset, taskStatusFilterLabel } from "./tasks";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableFilterField, type TaskTableQuery } from "./taskTableViews";
import { taskWorkedTimeFilterLabel } from "./taskWorkedTimeFilter";

/** Sidebar order: the history filters lead because no column header reaches them. */
export const TASK_TABLE_FILTERS: readonly { field: TaskTableFilterField; name: string; unsetLabel: string; standalone?: true }[] = [
  { field: "workedOn", name: "Worked on", unsetLabel: "-", standalone: true },
  { field: "statusChanged", name: "Status changed", unsetLabel: "-", standalone: true },
  { field: "statuses", name: "Status", unsetLabel: "All statuses" },
  { field: "scope", name: "Scope", unsetLabel: "All scopes" },
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
    case "scope":
      return query.scope;
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
