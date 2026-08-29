import type { PointerEvent as ReactPointerEvent } from "react";
import type { Task } from "../../lib/types";
import type { TaskTableColumn, TaskTableColumnId } from "../lib/taskTable";
import type { TaskGraphProjection } from "../lib/taskGraph";
import { TASK_STATUS_LABEL } from "../lib/tasks";
import { formatDate } from "../lib/time";
import { StatusTrigger } from "./StatusTrigger";
import { TaskScopeButton } from "./TaskScopeButton";
import { TaskScoreControls } from "./TaskScoreControls";
import { WorkedTime, WorkingBadge } from "./TaskWorkingControl";

export type TaskTableColumnInteraction = {
  draggingId: TaskTableColumnId | null;
  overId: TaskTableColumnId | null;
  onMovePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: TaskTableColumnId,
  ) => void;
  onResizePointerDown: (
    event: ReactPointerEvent<HTMLElement>,
    id: TaskTableColumnId,
  ) => void;
};

function TaskTableCell({
  id,
  task,
  taskGraph,
  readOnly,
}: {
  id: TaskTableColumnId;
  task: Task;
  taskGraph: TaskGraphProjection;
  readOnly: boolean;
}) {
  switch (id) {
    case "title":
      return (
        <td className="task-table__col task-table__col--title task-table__title">
          <span>{task.title}</span>
          {task.workingNow && <WorkingBadge />}
        </td>
      );
    case "scope":
      return (
        <td className="task-table__col task-table__col--scope">
          {readOnly ? (task.scope || "—") : <TaskScopeButton task={task} />}
        </td>
      );
    case "parent":
      return (
        <td className="task-table__col task-table__col--parent">
          {task.parentTaskId === null
            ? "—"
            : taskGraph.byId.get(task.parentTaskId)?.title ?? "—"}
        </td>
      );
    case "status":
      return (
        <td className="task-table__col task-table__col--status">
          {readOnly ? (
            <span
              className={`task-status-badge task-status-badge--${task.status}`}
            >
              <span
                className={`status-dot status-dot--${task.status}`}
                aria-hidden="true"
              />
              <span>{TASK_STATUS_LABEL[task.status]}</span>
            </span>
          ) : (
            <StatusTrigger task={task} />
          )}
        </td>
      );
    case "value":
      return (
        <td className="task-table__col task-table__col--value">
          {readOnly ? (
            (task.value ?? "—")
          ) : (
            <TaskScoreControls task={task} score="value" />
          )}
        </td>
      );
    case "effort":
      return (
        <td className="task-table__col task-table__col--effort">
          {readOnly ? (
            (task.effort ?? "—")
          ) : (
            <TaskScoreControls task={task} score="effort" />
          )}
        </td>
      );
    case "workedTime":
      return (
        <td className="task-table__col task-table__col--workedTime">
          <WorkedTime task={task} />
        </td>
      );
    case "created":
      return (
        <td className="task-table__col task-table__col--created">
          {formatDate(task.createdAt)}
        </td>
      );
    case "updated":
      return (
        <td className="task-table__col task-table__col--updated">
          {formatDate(task.updatedAt)}
        </td>
      );
  }
}

/** Shared Tasks table body — column set and drag/resize are caller-owned. */
export function TaskTable({
  columns,
  tasks,
  taskGraph,
  emptyCopy,
  selectedTaskId = null,
  onSelect,
  columnInteraction,
  readOnly = false,
}: {
  columns: TaskTableColumn[];
  tasks: Task[];
  taskGraph: TaskGraphProjection;
  emptyCopy: string;
  selectedTaskId?: number | null;
  onSelect?: (id: number, origin: HTMLElement) => void;
  columnInteraction?: TaskTableColumnInteraction;
  /** Overview peek: static cells, no row selection or edits. */
  readOnly?: boolean;
}) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  return (
    <div className="task-table-wrap">
      <table className="task-table" style={{ width: tableWidth }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th
                key={column.id}
                className={`task-table__col task-table__col--${column.id}${
                  columnInteraction?.draggingId === column.id
                    ? " task-table__col--dragging"
                    : ""
                }${
                  columnInteraction?.overId === column.id
                    ? " task-table__col--over"
                    : ""
                }`}
                data-task-col={column.id}
                onPointerDown={
                  columnInteraction
                    ? (event) =>
                        columnInteraction.onMovePointerDown(event, column.id)
                    : undefined
                }
              >
                {column.label}
                {columnInteraction ? (
                  <span
                    className="task-table__resize"
                    role="separator"
                    aria-orientation="vertical"
                    aria-label={`Resize ${column.label}`}
                    onPointerDown={(event) =>
                      columnInteraction.onResizePointerDown(event, column.id)
                    }
                  />
                ) : null}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {tasks.length === 0 ? (
            <tr>
              <td colSpan={columns.length} className="task-table__empty">
                {emptyCopy}
              </td>
            </tr>
          ) : (
            tasks.map((task) => (
              <tr
                key={task.id}
                className={`task-table__row${
                  !readOnly && selectedTaskId === task.id
                    ? " task-table__row--selected"
                    : ""
                }${readOnly ? " task-table__row--readonly" : ""}`}
                tabIndex={readOnly ? undefined : 0}
                onClick={
                  readOnly || !onSelect
                    ? undefined
                    : (e) => {
                        const target = e.target as HTMLElement;
                        if (
                          target.closest("button, input, select, a, [role]")
                        ) {
                          return;
                        }
                        onSelect(task.id, e.currentTarget);
                      }
                }
                onKeyDown={
                  readOnly || !onSelect
                    ? undefined
                    : (e) => {
                        if (
                          e.key !== "Enter" ||
                          e.target !== e.currentTarget
                        ) {
                          return;
                        }
                        onSelect(task.id, e.currentTarget);
                      }
                }
              >
                {columns.map((column) => (
                  <TaskTableCell
                    key={column.id}
                    id={column.id}
                    task={task}
                    taskGraph={taskGraph}
                    readOnly={readOnly}
                  />
                ))}
              </tr>
            ))
          )}
        </tbody>
      </table>
    </div>
  );
}
