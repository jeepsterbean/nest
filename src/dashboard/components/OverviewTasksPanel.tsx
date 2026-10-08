import {
  useMemo,
  useState,
  type PointerEvent as ReactPointerEvent,
  type ReactNode,
} from "react";
import { ViewToggle } from "./ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { overviewTaskColumns } from "../lib/taskTable";
import {
  CLOSED_STATUSES,
  groupTasksByStatus,
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
  minimised = false,
  headerStart,
  headerEnd,
  onHeaderPointerDown,
  dragTitle,
}: {
  onOpenTasks: () => void;
  minimised?: boolean;
  headerStart?: ReactNode;
  headerEnd?: ReactNode;
  onHeaderPointerDown?: (event: ReactPointerEvent<HTMLElement>) => void;
  dragTitle?: string;
}) {
  const { tasks, taskGraph, loaded } = useDashboardData();
  const [statusFilter, setStatusFilter] = useState<"open" | "closed">("open");
  const groupedTasks = useMemo(() => groupTasksByStatus(tasks), [tasks]);

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

  if (minimised) {
    return (
      <div
        className={`overview-tasks overview-tasks--minimised${
          onHeaderPointerDown ? " overview-tasks--draggable" : ""
        }`}
        title={dragTitle}
        onPointerDown={onHeaderPointerDown}
      >
        {headerStart}
        <div className="overview-tasks__counts">
          <span>{groupedTasks.active.length} Active</span>
          <span aria-hidden="true">·</span>
          <span>{groupedTasks.up_next.length} Up next</span>
        </div>
        <button
          type="button"
          className="overview-panel__goto"
          aria-label="Open Tasks"
          onClick={onOpenTasks}
        >
          Tasks
        </button>
        {headerEnd}
      </div>
    );
  }

  return (
    <div className="overview-tasks">
      <header
        className={`overview-panel__head${
          onHeaderPointerDown ? " overview-panel__head--draggable" : ""
        }`}
        title={dragTitle}
        onPointerDown={onHeaderPointerDown}
      >
        {headerStart ? (
          <div className="overview-panel__head-start">{headerStart}</div>
        ) : null}
        <ViewToggle
          value={statusFilter}
          options={OVERVIEW_STATUS_FILTERS}
          label="Task status"
          onChange={setStatusFilter}
        />
        <button
          type="button"
          className="overview-panel__goto"
          aria-label="Open Tasks"
          onClick={onOpenTasks}
        >
          Tasks
        </button>
        {headerEnd ? (
          <div className="overview-panel__head-end">{headerEnd}</div>
        ) : null}
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
