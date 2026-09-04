import { useMemo, useState } from "react";
import { ViewToggle } from "./ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { overviewTaskColumns } from "../lib/taskTable";
import {
  CLOSED_STATUSES,
  sortTaskTable,
  WORKING_STATUSES,
} from "../lib/tasks";
import { TaskTable } from "../task/TaskTable";

const OVERVIEW_COLUMNS = overviewTaskColumns();
const OVERVIEW_STATUS_FILTERS = [
  { key: "open" as const, label: "Open" },
  { key: "closed" as const, label: "Closed" },
];

/** Read-only Tasks peek for Overview — Open/Closed filter and a jump to Tasks. */
export function OverviewTasksPanel({
  onOpenTasks,
}: {
  onOpenTasks: () => void;
}) {
  const { tasks, taskGraph, loaded } = useDashboardData();
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");

  const visibleTasks = useMemo(() => {
    const statuses =
      statusFilter === "open" ? WORKING_STATUSES : CLOSED_STATUSES;
    return sortTaskTable(
      tasks.filter((task) => statuses.includes(task.status)),
      "status",
    );
  }, [statusFilter, tasks]);

  const emptyListCopy =
    tasks.length === 0
      ? "Nothing on the board yet."
      : statusFilter === "open"
        ? "No open tasks."
        : "No closed tasks.";

  if (!loaded) {
    return (
      <div className="overview-tasks">
        <div className="task-board__loading">Laying out the board…</div>
      </div>
    );
  }

  return (
    <div className="overview-tasks">
      <header className="overview-panel__head">
        <ViewToggle
          value={statusFilter}
          options={OVERVIEW_STATUS_FILTERS}
          label="Task status"
          onChange={setStatusFilter}
        />
        <button
          type="button"
          className="overview-panel__goto"
          aria-label="Open Tasks section"
          onClick={onOpenTasks}
        >
          Tasks
        </button>
      </header>
      <div className="overview-tasks__body">
        <div className="overview-tasks__main">
          <TaskTable
            columns={OVERVIEW_COLUMNS}
            tasks={visibleTasks}
            taskGraph={taskGraph}
            emptyCopy={emptyListCopy}
            readOnly
          />
        </div>
      </div>
    </div>
  );
}
