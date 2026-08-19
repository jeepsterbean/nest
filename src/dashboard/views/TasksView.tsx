import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createTask } from "../../lib/commands";
import type { TaskStatus } from "../../lib/types";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import { scopeMatches, type ScopeNode } from "../lib/scope";
import {
  readTaskView,
  TASK_VIEWS,
  writeTaskView,
  type TaskTableColumnId,
} from "../lib/taskTable";
import {
  pinWorkingNowFirst,
  TASK_STATUS_FILTERS,
  TASK_STATUS_LABEL,
} from "../lib/tasks";
import { formatDate } from "../lib/time";
import { chevronRightIcon } from "../components/icons";
import { StatusTrigger } from "../task/StatusTrigger";
import { TaskCard } from "../task/TaskCard";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskScopeButton } from "../task/TaskScopeButton";
import { TaskScoreControls } from "../task/TaskScoreControls";
import {
  WorkedTime,
  WorkingBadge,
} from "../task/TaskWorkingControl";

export function TasksView() {
  const { tasks, scopeTree, taskGraph, loaded, reload, setError } =
    useDashboardData();
  const [taskView, setTaskView] = useState(readTaskView);
  const [statusFilter, setStatusFilter] = useState<TaskStatus>("active");
  const tableColumns = useTaskTableColumns();
  const [composerTitle, setComposerTitle] = useState("");
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskScope, setSelectedTaskScope] = useState<string | null>(
    null,
  );
  const [collapsedScopePaths, setCollapsedScopePaths] = useState<Set<string>>(
    new Set(),
  );
  const [scopePanelCollapsed, setScopePanelCollapsed] = useState(true);
  const selectionOriginRef = useRef<HTMLElement | null>(null);
  const { statusMenu, scopeMenu } = useTaskMenus();

  const selectTask = useCallback((id: number, origin?: HTMLElement) => {
    selectionOriginRef.current = origin ?? null;
    setSelectedTaskId(id);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedTaskId(null);
    const origin = selectionOriginRef.current;
    selectionOriginRef.current = null;
    if (origin?.isConnected) origin.focus();
  }, []);

  // Drop the selection when the task disappears (deleted or reloaded away).
  useEffect(() => {
    if (selectedTaskId !== null && !taskGraph.byId.has(selectedTaskId)) {
      setSelectedTaskId(null);
    }
  }, [taskGraph, selectedTaskId]);

  // Escape closes the detail panel, but only once open menus and in-place
  // editors have had their turn at the key.
  useEffect(() => {
    if (selectedTaskId === null) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (statusMenu || scopeMenu) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, statusMenu, scopeMenu, closeDetail]);

  // Drop scope selection / collapse state for paths that no longer exist.
  useEffect(() => {
    if (selectedTaskScope !== null && !scopeTree.paths.has(selectedTaskScope)) {
      setSelectedTaskScope(null);
    }
    setCollapsedScopePaths((prev) => {
      const next = new Set(
        [...prev].filter((path) => scopeTree.paths.has(path)),
      );
      return next.size === prev.size ? prev : next;
    });
  }, [scopeTree.paths, selectedTaskScope]);

  const scopedTasks = useMemo(
    () => tasks.filter((task) => scopeMatches(task.scope, selectedTaskScope)),
    [tasks, selectedTaskScope],
  );
  const visibleTasks = useMemo(
    () => scopedTasks.filter((task) => task.status === statusFilter),
    [scopedTasks, statusFilter],
  );
  const emptyListCopy =
    tasks.length === 0
      ? "Nothing on the board yet — name the first task above."
      : scopedTasks.length === 0
        ? "No tasks in this scope yet."
        : `No ${TASK_STATUS_LABEL[statusFilter].toLowerCase()} tasks.`;

  // Creates in the status being viewed, inherits the active scope filter, and
  // opens the detail panel so the description and scores are one step away.
  const onComposerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const title = composerTitle.trim();
    if (!title) return;
    try {
      const created = await createTask(title, "", statusFilter, selectedTaskScope);
      await reload();
      setComposerTitle("");
      selectTask(created.id);
    } catch (error) {
      setError(String(error));
    }
  };

  const toggleScopeCollapsed = (path: string) => {
    setCollapsedScopePaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const selectedTask =
    selectedTaskId === null
      ? null
      : taskGraph.byId.get(selectedTaskId) ?? null;

  const renderScopeNode = (node: ScopeNode) => {
    const selected = selectedTaskScope === node.path;
    const collapsed = collapsedScopePaths.has(node.path);
    const hasChildren = node.children.length > 0;
    return (
      <li className="task-scope-tree__item" key={node.path}>
        <div className="task-scope-tree__row">
          <button
            type="button"
            className={
              selected
                ? "task-scope-tree__btn task-scope-tree__btn--active"
                : "task-scope-tree__btn"
            }
            onClick={() => setSelectedTaskScope(node.path)}
            title={node.path}
          >
            <span
              className={`task-scope-tree__branch${
                node.depth === 0 ? " task-scope-tree__branch--root" : ""
              }`}
              aria-hidden="true"
            >
              {node.depth === 0 ? (
                <span className="task-scope-tree__root-dot" />
              ) : (
                Array.from({ length: Math.min(node.depth, 4) }, (_, index) => (
                  <span
                    className={`task-scope-tree__rail${
                      index === Math.min(node.depth, 4) - 1
                        ? " task-scope-tree__rail--branch"
                        : ""
                    }`}
                    key={index}
                  />
                ))
              )}
            </span>
            <span className="task-scope-tree__label">{node.label}</span>
          </button>
          <button
            type="button"
            className="task-scope-tree__count"
            onClick={() => hasChildren && toggleScopeCollapsed(node.path)}
            aria-expanded={hasChildren ? !collapsed : undefined}
            aria-label={
              hasChildren
                ? `${collapsed ? "Show" : "Hide"} child scopes for ${node.path}`
                : `${node.count} tasks in ${node.path}`
            }
            title={
              hasChildren
                ? `${collapsed ? "Show" : "Hide"} child scopes`
                : `${node.count} tasks`
            }
          >
            {node.count}
          </button>
        </div>
        {hasChildren && !collapsed && (
          <ol className="task-scope-tree">
            {node.children.map(renderScopeNode)}
          </ol>
        )}
      </li>
    );
  };

  const renderTaskColumn = () => (
    <section className="task-column">
      <header className="task-column__head">
        <h3>{TASK_STATUS_LABEL[statusFilter]}</h3>
        <span>{visibleTasks.length}</span>
      </header>
      {visibleTasks.length === 0 ? (
        <div className="task-column__empty">{emptyListCopy}</div>
      ) : (
        <ol className="task-card-list">
          {pinWorkingNowFirst(visibleTasks).map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              onSelect={(origin) => selectTask(task.id, origin)}
              statusCompact
            />
          ))}
        </ol>
      )}
    </section>
  );

  const renderTableCell = (id: TaskTableColumnId, task: (typeof tasks)[number]) => {
    switch (id) {
      case "title":
        return (
          <td key={id} className="task-table__col task-table__col--title task-table__title">
            <span>{task.title}</span>
            {task.workingNow && <WorkingBadge />}
          </td>
        );
      case "scope":
        return (
          <td key={id} className="task-table__col task-table__col--scope">
            <TaskScopeButton task={task} />
          </td>
        );
      case "parent":
        return (
          <td key={id} className="task-table__col task-table__col--parent">
            {task.parentTaskId === null
              ? "—"
              : taskGraph.byId.get(task.parentTaskId)?.title ?? "—"}
          </td>
        );
      case "status":
        return (
          <td key={id} className="task-table__col task-table__col--status">
            <StatusTrigger task={task} />
          </td>
        );
      case "priority":
        return (
          <td key={id} className="task-table__col task-table__col--priority">
            <TaskScoreControls task={task} />
          </td>
        );
      case "workedTime":
        return (
          <td key={id} className="task-table__col task-table__col--workedTime">
            <WorkedTime task={task} />
          </td>
        );
      case "created":
        return (
          <td key={id} className="task-table__col task-table__col--created">
            {formatDate(task.createdAt)}
          </td>
        );
      case "updated":
        return (
          <td key={id} className="task-table__col task-table__col--updated">
            {formatDate(task.updatedAt)}
          </td>
        );
    }
  };

  return (
    <section className="dash-section dash-section--tasks" aria-busy={!loaded}>
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Tasks</h2>
        </div>
        <div className="dash-toolbar">
          <ViewToggle
            value={statusFilter}
            options={TASK_STATUS_FILTERS}
            label="Task status"
            onChange={setStatusFilter}
          />
          <ViewToggle
            value={taskView}
            options={TASK_VIEWS}
            label="Task view"
            onChange={(key) => {
              writeTaskView(key);
              setTaskView(key);
            }}
          />
        </div>
      </header>

      {!loaded ? (
        <div className="task-board__loading">Laying out the board…</div>
      ) : (
        <div
          className={`task-workspace${
            scopeTree.roots.length === 0 ? " task-workspace--no-scopes" : ""
          }${selectedTask ? " task-workspace--detail" : ""}${
            scopePanelCollapsed ? " task-workspace--scope-collapsed" : ""
          }`}
        >
          {scopeTree.roots.length > 0 && (
            <aside
              className={`task-scope-panel${
                scopePanelCollapsed ? " task-scope-panel--collapsed" : ""
              }`}
              aria-label="Task scopes"
            >
              <div className="task-scope-panel__head">
                {!scopePanelCollapsed && <span>Scopes</span>}
                <button
                  type="button"
                  className="task-scope-panel__toggle"
                  aria-expanded={!scopePanelCollapsed}
                  aria-label={
                    scopePanelCollapsed
                      ? "Expand task scopes"
                      : "Collapse task scopes"
                  }
                  title={scopePanelCollapsed ? "Show scopes" : "Hide scopes"}
                  onClick={() =>
                    setScopePanelCollapsed((collapsed) => !collapsed)
                  }
                >
                  {chevronRightIcon}
                </button>
              </div>
              {!scopePanelCollapsed && (
                <>
                  <button
                    type="button"
                    className={
                      selectedTaskScope === null
                        ? "task-scope-tree__btn task-scope-tree__btn--all task-scope-tree__btn--active"
                        : "task-scope-tree__btn task-scope-tree__btn--all"
                    }
                    onClick={() => setSelectedTaskScope(null)}
                  >
                    <span
                      className="task-scope-tree__branch task-scope-tree__branch--all"
                      aria-hidden="true"
                    >
                      <span className="task-scope-tree__root-dot" />
                    </span>
                    <span className="task-scope-tree__label">All tasks</span>
                    <span className="task-scope-tree__count">{tasks.length}</span>
                  </button>
                  <ol className="task-scope-tree">
                    {scopeTree.roots.map(renderScopeNode)}
                  </ol>
                </>
              )}
            </aside>
          )}

          <div className="task-workspace__main">
            <form className="task-composer" onSubmit={onComposerSubmit}>
              <input
                type="text"
                className="task-composer__title"
                placeholder={
                  selectedTaskScope
                    ? `Add a task in ${selectedTaskScope}…`
                    : "Add a task…"
                }
                aria-label="New task title"
                value={composerTitle}
                onChange={(e) => setComposerTitle(e.target.value)}
              />
              <button type="submit" className="btn-accent" disabled={!composerTitle.trim()}>
                Add
              </button>
            </form>
          {taskView === "kanban" && (
            <div className="task-board">{renderTaskColumn()}</div>
          )}
          {taskView === "table" && (
            <div className="task-table-wrap">
              <table
                className="task-table"
                style={{ width: tableColumns.tableWidth }}
              >
                <colgroup>
                  {tableColumns.columns.map((column) => (
                    <col key={column.id} style={{ width: column.width }} />
                  ))}
                </colgroup>
                <thead>
                  <tr>
                    {tableColumns.columns.map((column) => (
                      <th
                        key={column.id}
                        className={`task-table__col task-table__col--${column.id}${
                          tableColumns.draggingId === column.id
                            ? " task-table__col--dragging"
                            : ""
                        }${
                          tableColumns.overId === column.id
                            ? " task-table__col--over"
                            : ""
                        }`}
                        data-task-col={column.id}
                        onPointerDown={(event) =>
                          tableColumns.onMovePointerDown(event, column.id)
                        }
                      >
                        {column.label}
                        <span
                          className="task-table__resize"
                          role="separator"
                          aria-orientation="vertical"
                          aria-label={`Resize ${column.label}`}
                          onPointerDown={(event) =>
                            tableColumns.onResizePointerDown(event, column.id)
                          }
                        />
                      </th>
                    ))}
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.length === 0 ? (
                    <tr>
                      <td
                        colSpan={tableColumns.columns.length}
                        className="task-table__empty"
                      >
                        {emptyListCopy}
                      </td>
                    </tr>
                  ) : (
                    [...visibleTasks]
                      .sort(
                        (a, b) =>
                          b.updatedAt - a.updatedAt || b.id - a.id,
                      )
                      .map((task) => (
                        <tr
                          key={task.id}
                          className={`task-table__row${
                            selectedTaskId === task.id
                              ? " task-table__row--selected"
                              : ""
                          }`}
                          tabIndex={0}
                          onClick={(e) => {
                            const target = e.target as HTMLElement;
                            if (target.closest("button, input, select, a, [role]")) {
                              return;
                            }
                            selectTask(task.id, e.currentTarget);
                          }}
                          onKeyDown={(e) => {
                            if (e.key !== "Enter" || e.target !== e.currentTarget) {
                              return;
                            }
                            selectTask(task.id, e.currentTarget);
                          }}
                        >
                          {tableColumns.columns.map((column) =>
                            renderTableCell(column.id, task),
                          )}
                        </tr>
                      ))
                  )}
                </tbody>
              </table>
            </div>
          )}
          </div>
          {selectedTask && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              onClose={closeDetail}
            />
          )}
        </div>
      )}
    </section>
  );
}
