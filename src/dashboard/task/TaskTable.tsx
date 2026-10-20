import type { ReactNode, Ref, PointerEvent as ReactPointerEvent } from "react";
import type { Task } from "../../lib/types";
import type { TaskTableColumn, TaskTableColumnId } from "../lib/taskTable";
import { formatDate } from "../lib/time";
import { chevronDownIcon, chevronRightIcon } from "../components/icons";
import { StatusTrigger } from "./StatusTrigger";
import { TaskScoreControls } from "./TaskScoreControls";
import { WorkingBadge } from "./TaskWorkingControl";

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

/** Row depth and expand state when the table is grouped under Parents. */
export type TaskTableNesting = {
  depthById: ReadonlyMap<number, number>;
  childCountById: ReadonlyMap<number, number>;
  collapsedIds: ReadonlySet<number>;
  onToggle: (id: number) => void;
};

const NESTING_INDENT_PX = 18;

function TaskTableCell({
  id,
  task,
  nesting,
}: {
  nesting?: TaskTableNesting;
  id: TaskTableColumnId;
  task: Task;
}) {
  switch (id) {
    case "title": {
      const childCount = nesting?.childCountById.get(task.id) ?? 0;
      const collapsed = nesting?.collapsedIds.has(task.id) ?? false;
      return (
        <td className="task-table__col task-table__col--title task-table__title">
          <div
            className="task-table__title-content"
            style={nesting ? { paddingLeft: (nesting.depthById.get(task.id) ?? 0) * NESTING_INDENT_PX } : undefined}
          >
            {nesting && (childCount > 0 ? (
              <button
                type="button"
                className="task-table__fold"
                aria-expanded={!collapsed}
                aria-label={`${collapsed ? "Expand" : "Collapse"} ${task.title}`}
                onClick={() => nesting.onToggle(task.id)}
              >
                {collapsed ? chevronRightIcon : chevronDownIcon}
              </button>
            ) : (
              <span className="task-table__fold-spacer" aria-hidden="true" />
            ))}
            <span title={task.title}>{task.title}</span>
            {task.workingNow && <WorkingBadge />}
          </div>
        </td>
      );
    }
    case "status":
      return (
        <td className="task-table__col task-table__col--status">
          <StatusTrigger task={task} showIcon={false} />
        </td>
      );
    case "value":
      return (
        <td className="task-table__col task-table__col--value">
          <TaskScoreControls task={task} score="value" />
        </td>
      );
    case "effort":
      return (
        <td className="task-table__col task-table__col--effort">
          <TaskScoreControls task={task} score="effort" />
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
    case "closed":
      return (
        <td className="task-table__col task-table__col--closed">
          {task.closedAt !== null && formatDate(task.closedAt)}
        </td>
      );
  }
}

/** Shared Tasks table body — column set and drag/resize are caller-owned. */
export function TaskTable({
  columns,
  tasks,
  emptyCopy,
  selectedTaskId = null,
  onSelect,
  columnInteraction,
  renderHeader,
  headerSort,
  wrapRef,
  nesting,
}: {
  /** Rows in `tasks` are already ordered for nesting; this only adds depth and folding. */
  nesting?: TaskTableNesting;
  renderHeader?: (column: TaskTableColumn) => ReactNode;
  headerSort?: { column: TaskTableColumnId; direction: "ascending" | "descending" };
  columns: TaskTableColumn[];
  tasks: Task[];
  emptyCopy: string;
  selectedTaskId?: number | null;
  onSelect?: (id: number, origin: HTMLElement) => void;
  columnInteraction?: TaskTableColumnInteraction;
  wrapRef?: Ref<HTMLDivElement>;
}) {
  const tableWidth = columns.reduce((sum, column) => sum + column.width, 0);

  return (
    <div className="task-table-wrap" ref={wrapRef}>
      <table className="task-table" style={{ width: tableWidth, minWidth: "100%" }}>
        <colgroup>
          {columns.map((column) => (
            <col key={column.id} style={{ width: column.width }} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column, index) => (
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
                aria-sort={headerSort?.column === column.id ? headerSort.direction : undefined}
                data-task-col={column.id}
                onPointerDown={
                  columnInteraction
                    ? (event) =>
                        columnInteraction.onMovePointerDown(event, column.id)
                    : undefined
                }
              >
                {renderHeader ? (
                  <div className="task-table__header-controls">
                    {columnInteraction && <span className="task-table__move" title={`Drag to move ${column.label}`} aria-hidden="true">⋮</span>}
                    {renderHeader(column)}
                  </div>
                ) : column.label}
                {columnInteraction && index < columns.length - 1 ? (
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
                  selectedTaskId === task.id
                    ? " task-table__row--selected"
                    : ""
                }`}
                tabIndex={0}
                onClick={
                  !onSelect
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
                  !onSelect
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
                    nesting={nesting}
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
