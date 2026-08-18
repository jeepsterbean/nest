import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { createTask, setTaskStatus } from "../../lib/commands";
import type { TaskStatus } from "../../lib/types";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { scopeMatches, type ScopeNode } from "../lib/scope";
import {
  CLOSED_STATUSES,
  groupTasksByStatus,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
  WORKING_STATUSES,
} from "../lib/tasks";
import { formatDate } from "../lib/time";
import {
  checkIcon,
  chevronDownIcon,
  chevronRightIcon,
} from "../components/icons";
import { StatusTrigger } from "../task/StatusTrigger";
import { TaskCard } from "../task/TaskCard";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskScopeButton } from "../task/TaskScopeButton";
import { TaskScoreControls } from "../task/TaskScoreControls";
import { TaskGraphBadges } from "../task/TaskRelations";
import {
  TaskWorkingControl,
  WorkingBadge,
} from "../task/TaskWorkingControl";

const TASK_VIEWS = [
  { key: "kanban", label: "Kanban" },
  { key: "table", label: "Table" },
] as const;

type TaskViewKey = (typeof TASK_VIEWS)[number]["key"];

const DRAG_START_DISTANCE = 6;

const isTaskStatus = (value: string | undefined): value is TaskStatus =>
  value !== undefined && TASK_STATUSES.some((status) => status === value);

type TaskDragSession = {
  pointerId: number;
  taskId: number;
  card: HTMLLIElement;
  startX: number;
  startY: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
  dragging: boolean;
  removeListeners: () => void;
};

type TaskDragPreview = {
  taskId: number;
  x: number;
  y: number;
  offsetX: number;
  offsetY: number;
  width: number;
  height: number;
};

export function TasksView() {
  const { tasks, scopeTree, taskGraph, loaded, mutate, reload, setError } =
    useDashboardData();
  const [taskView, setTaskView] = useState<TaskViewKey>("kanban");
  const [composerTitle, setComposerTitle] = useState("");
  const [composerStatus, setComposerStatus] = useState<TaskStatus>("backlog");
  const [composerStatusOpen, setComposerStatusOpen] = useState(false);
  const [closedRailOpen, setClosedRailOpen] = useState(false);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskScope, setSelectedTaskScope] = useState<string | null>(
    null,
  );
  const [collapsedScopePaths, setCollapsedScopePaths] = useState<Set<string>>(
    new Set(),
  );
  const [scopePanelCollapsed, setScopePanelCollapsed] = useState(false);
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [dragPreview, setDragPreview] = useState<TaskDragPreview | null>(null);
  const dragSessionRef = useRef<TaskDragSession | null>(null);
  const suppressClickTaskIdRef = useRef<number | null>(null);
  const selectionOriginRef = useRef<HTMLElement | null>(null);
  const composerStatusTriggerRef = useRef<HTMLButtonElement | null>(null);
  const composerStatusWrapRef = useRef<HTMLDivElement | null>(null);
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

  useEffect(() => {
    if (!composerStatusOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const wrap = composerStatusWrapRef.current;
      if (wrap && !wrap.contains(event.target as Node)) {
        setComposerStatusOpen(false);
      }
    };
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [composerStatusOpen]);

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

  useEffect(
    () => () => {
      const session = dragSessionRef.current;
      session?.removeListeners();
      if (session?.card.hasPointerCapture(session.pointerId)) {
        session.card.releasePointerCapture(session.pointerId);
      }
      document.documentElement.classList.remove("task-drag-in-progress");
    },
    [],
  );

  const visibleTasks = useMemo(
    () => tasks.filter((task) => scopeMatches(task.scope, selectedTaskScope)),
    [tasks, selectedTaskScope],
  );
  const visibleTasksByStatus = useMemo(
    () => groupTasksByStatus(visibleTasks),
    [visibleTasks],
  );

  // Creates in the composer's status, inherits the active scope filter, and
  // opens the detail panel so the description and scores are one step away.
  const onComposerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const title = composerTitle.trim();
    if (!title) return;
    try {
      const created = await createTask(title, "", composerStatus, selectedTaskScope);
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

  const statusAtPoint = (clientX: number, clientY: number) => {
    const column = document
      .elementFromPoint(clientX, clientY)
      ?.closest<HTMLElement>("[data-task-status]");
    const status = column?.dataset.taskStatus;
    return isTaskStatus(status) ? status : null;
  };

  const clearTaskDrag = () => {
    const session = dragSessionRef.current;
    session?.removeListeners();
    if (session?.card.hasPointerCapture(session.pointerId)) {
      session.card.releasePointerCapture(session.pointerId);
    }
    document.documentElement.classList.remove("task-drag-in-progress");
    dragSessionRef.current = null;
    setDraggedTaskId(null);
    setDragOverStatus(null);
    setDragPreview(null);
  };

  const updateTaskDrag = (e: globalThis.PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    if (!session.dragging) {
      const distance = Math.hypot(
        e.clientX - session.startX,
        e.clientY - session.startY,
      );
      if (distance < DRAG_START_DISTANCE) return;
      session.dragging = true;
      session.card.setPointerCapture(e.pointerId);
      document.documentElement.classList.add("task-drag-in-progress");
      setDraggedTaskId(session.taskId);
    }

    e.preventDefault();
    setDragPreview({
      taskId: session.taskId,
      x: e.clientX,
      y: e.clientY,
      offsetX: session.offsetX,
      offsetY: session.offsetY,
      width: session.width,
      height: session.height,
    });
    setDragOverStatus(statusAtPoint(e.clientX, e.clientY));
  };

  const finishTaskDrag = (e: globalThis.PointerEvent) => {
    const session = dragSessionRef.current;
    if (!session || session.pointerId !== e.pointerId) return;

    const targetStatus = session.dragging
      ? statusAtPoint(e.clientX, e.clientY)
      : null;
    const task = tasks.find((candidate) => candidate.id === session.taskId);

    if (session.dragging) {
      e.preventDefault();
      suppressClickTaskIdRef.current = session.taskId;
      window.setTimeout(() => {
        if (suppressClickTaskIdRef.current === session.taskId) {
          suppressClickTaskIdRef.current = null;
        }
      }, 0);
    }

    clearTaskDrag();

    if (!task || !targetStatus || task.status === targetStatus) return;
    void mutate(() => setTaskStatus(task.id, targetStatus));
  };

  const onTaskPointerDown = (
    e: ReactPointerEvent<HTMLLIElement>,
    taskId: number,
  ) => {
    if (e.button !== 0 || !e.isPrimary) return;
    // Cards drag from their body only. Starting a session on a control would
    // capture the pointer and swallow the control's click on any hand tremor,
    // silently dropping the task in another lane instead.
    if (
      (e.target as HTMLElement).closest(
        "button, a, input, textarea, select, [contenteditable='true']",
      )
    ) {
      return;
    }

    const cardRect = e.currentTarget.getBoundingClientRect();
    const onPointerMove = (event: globalThis.PointerEvent) =>
      updateTaskDrag(event);
    const onPointerUp = (event: globalThis.PointerEvent) =>
      finishTaskDrag(event);
    const onPointerCancel = () => clearTaskDrag();
    const removeListeners = () => {
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerCancel);
    };

    dragSessionRef.current = {
      pointerId: e.pointerId,
      taskId,
      card: e.currentTarget,
      startX: e.clientX,
      startY: e.clientY,
      offsetX: e.clientX - cardRect.left,
      offsetY: e.clientY - cardRect.top,
      width: cardRect.width,
      height: cardRect.height,
      dragging: false,
      removeListeners,
    };

    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerCancel);
  };

  const onTaskClickCapture = (e: MouseEvent<HTMLLIElement>, taskId: number) => {
    if (suppressClickTaskIdRef.current !== taskId) return;
    e.preventDefault();
    e.stopPropagation();
    suppressClickTaskIdRef.current = null;
  };

  const selectedTask =
    selectedTaskId === null
      ? null
      : taskGraph.byId.get(selectedTaskId) ?? null;
  const previewTask = dragPreview
    ? tasks.find((task) => task.id === dragPreview.taskId)
    : null;
  const previewLeft = dragPreview
    ? Math.max(
        8,
        Math.min(
          dragPreview.x - dragPreview.offsetX,
          window.innerWidth - dragPreview.width - 8,
        ),
      )
    : 0;
  const previewTop = dragPreview
    ? Math.max(
        8,
        Math.min(
          dragPreview.y - dragPreview.offsetY,
          window.innerHeight - dragPreview.height - 8,
        ),
      )
    : 0;

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

  const renderTaskColumn = (status: TaskStatus, closed = false) => (
    <section
      className={`task-column${closed ? " task-column--closed" : ""}${
        dragOverStatus === status ? " task-column--drag-over" : ""
      }`}
      key={status}
      data-task-status={status}
    >
      <header className="task-column__head">
        <h3>{TASK_STATUS_LABEL[status]}</h3>
        <span>{visibleTasksByStatus[status].length}</span>
      </header>
      {visibleTasksByStatus[status].length === 0 ? (
        <div className="task-column__empty">Nothing here</div>
      ) : (
        <ol className="task-card-list">
          {visibleTasksByStatus[status].map((task) => (
            <TaskCard
              key={task.id}
              task={task}
              selected={selectedTaskId === task.id}
              onSelect={(origin) => selectTask(task.id, origin)}
              statusCompact
              draggable
              dragging={draggedTaskId === task.id}
              onPointerDown={(e) => onTaskPointerDown(e, task.id)}
              onClickCapture={(e) => onTaskClickCapture(e, task.id)}
            />
          ))}
        </ol>
      )}
    </section>
  );

  return (
    <section className="dash-section dash-section--tasks" aria-busy={!loaded}>
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Tasks</h2>
        </div>
        <ViewToggle
          value={taskView}
          options={TASK_VIEWS}
          label="Task view"
          onChange={setTaskView}
        />
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
          {taskView === "kanban" && (
            <>
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
                <div
                  ref={composerStatusWrapRef}
                  className="task-composer__status-wrap"
                  onBlur={(e) => {
                    if (!e.currentTarget.contains(e.relatedTarget)) {
                      setComposerStatusOpen(false);
                    }
                  }}
                  onKeyDown={(e) => {
                    if (e.key === "Escape" && composerStatusOpen) {
                      e.preventDefault();
                      setComposerStatusOpen(false);
                      composerStatusTriggerRef.current?.focus();
                    }
                    if (
                      composerStatusOpen &&
                      (e.key === "ArrowDown" || e.key === "ArrowUp")
                    ) {
                      e.preventDefault();
                      const options = Array.from(
                        e.currentTarget.querySelectorAll<HTMLButtonElement>(
                          "[role='option']",
                        ),
                      );
                      const index = options.indexOf(
                        document.activeElement as HTMLButtonElement,
                      );
                      const delta = e.key === "ArrowDown" ? 1 : -1;
                      options[
                        (index + delta + options.length) % options.length
                      ]?.focus();
                    }
                  }}
                >
                  <button
                    ref={composerStatusTriggerRef}
                    type="button"
                    className="task-composer__status"
                    aria-haspopup="listbox"
                    aria-expanded={composerStatusOpen}
                    onClick={() => setComposerStatusOpen((open) => !open)}
                  >
                    <span
                      className={`status-dot status-dot--${composerStatus}`}
                      aria-hidden="true"
                    />
                    <span>{TASK_STATUS_LABEL[composerStatus]}</span>
                    <span
                      className="task-composer__status-chevron"
                      aria-hidden="true"
                    >
                      {chevronDownIcon}
                    </span>
                  </button>
                  {composerStatusOpen && (
                    <div
                      className="task-composer__status-menu"
                      role="listbox"
                      aria-label="Status for the new task"
                    >
                      {WORKING_STATUSES.map((status) => {
                        const selected = status === composerStatus;
                        return (
                          <button
                            key={status}
                            type="button"
                            role="option"
                            aria-selected={selected}
                            className={
                              selected
                                ? "task-composer__status-option is-selected"
                                : "task-composer__status-option"
                            }
                            onClick={() => {
                              setComposerStatus(status);
                              setComposerStatusOpen(false);
                              composerStatusTriggerRef.current?.focus();
                            }}
                          >
                            <span
                              className={`status-dot status-dot--${status}`}
                              aria-hidden="true"
                            />
                            <span>{TASK_STATUS_LABEL[status]}</span>
                            {selected && (
                              <span
                                className="task-composer__status-check"
                                aria-hidden="true"
                              >
                                {checkIcon}
                              </span>
                            )}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
                <button type="submit" className="btn-accent" disabled={!composerTitle.trim()}>
                  Add
                </button>
              </form>
              {visibleTasks.length === 0 && (
                <p className="task-board__empty">
                  {tasks.length === 0
                    ? "Nothing on the board yet — name the first task above."
                    : "No tasks in this scope yet."}
                </p>
              )}
              <div className="task-board">
                {WORKING_STATUSES.map((status) => renderTaskColumn(status))}
              </div>
              <section className="task-closed-rail">
                <button
                  type="button"
                  className="task-closed-rail__toggle"
                  aria-expanded={closedRailOpen}
                  onClick={() => setClosedRailOpen((open) => !open)}
                >
                  <span
                    className={`task-closed-rail__chevron${
                      closedRailOpen ? " task-closed-rail__chevron--open" : ""
                    }`}
                    aria-hidden="true"
                  >
                    {chevronRightIcon}
                  </span>
                  <span className="task-closed-rail__label">Done</span>
                  <span className="task-closed-rail__counts">
                    {visibleTasksByStatus.completed.length} completed ·{" "}
                    {visibleTasksByStatus.cancelled.length} cancelled
                  </span>
                </button>
                {draggedTaskId !== null && !closedRailOpen && (
                  <div className="task-closed-rail__dropzones">
                    {CLOSED_STATUSES.map((status) => (
                      <div
                        key={status}
                        className={`task-closed-rail__dropzone${
                          dragOverStatus === status
                            ? " task-closed-rail__dropzone--over"
                            : ""
                        }`}
                        data-task-status={status}
                      >
                        {TASK_STATUS_LABEL[status]}
                      </div>
                    ))}
                  </div>
                )}
                {closedRailOpen && (
                  <div className="task-closed-rail__columns">
                    {CLOSED_STATUSES.map((status) =>
                      renderTaskColumn(status, true),
                    )}
                  </div>
                )}
              </section>
            </>
          )}
          {taskView === "table" && (
            <div className="task-table-wrap">
              <table className="task-table">
                <thead>
                  <tr>
                    <th>Title</th>
                    <th>Scope</th>
                    <th>Parent</th>
                    <th>Status</th>
                    <th>Readiness</th>
                    <th>Priority</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.length === 0 ? (
                    <tr>
                      <td colSpan={8} className="task-table__empty">
                        {tasks.length === 0
                          ? "Add a task from the Kanban view to start the board."
                          : "No tasks match this scope."}
                      </td>
                    </tr>
                  ) : (
                    [...visibleTasks]
                      .sort(
                        (a, b) =>
                          TASK_STATUSES.indexOf(a.status) -
                            TASK_STATUSES.indexOf(b.status) ||
                          b.updatedAt - a.updatedAt ||
                          b.id - a.id,
                      )
                      .map((task) => (
                        <tr
                          key={task.id}
                          className={`task-table__row${
                            selectedTaskId === task.id
                              ? " task-table__row--selected"
                              : ""
                          }${
                            task.workingNow
                              ? " task-table__row--working"
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
                          <td className="task-table__title">
                            <span>{task.title}</span>
                            {task.workingNow && <WorkingBadge compact />}
                          </td>
                          <td>
                            <TaskScopeButton task={task} />
                          </td>
                          <td>
                            {task.parentTaskId === null
                              ? "—"
                              : taskGraph.byId.get(task.parentTaskId)?.title ?? "—"}
                          </td>
                          <td>
                            <div className="task-table__status">
                              <StatusTrigger task={task} />
                              {task.status === "active" && (
                                <TaskWorkingControl
                                  task={task}
                                  compact
                                  showTime={false}
                                />
                              )}
                            </div>
                          </td>
                          <td>
                            <TaskGraphBadges task={task} />
                          </td>
                          <td>
                            <TaskScoreControls task={task} />
                          </td>
                          <td>{formatDate(task.createdAt)}</td>
                          <td>{formatDate(task.updatedAt)}</td>
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
      {dragPreview &&
        previewTask &&
        createPortal(
          <div
            className="dashboard task-drag-preview"
            style={{
              width: dragPreview.width,
              transform: `translate3d(${previewLeft}px, ${previewTop}px, 0)`,
            }}
            aria-hidden="true"
          >
            <TaskCard task={previewTask} showStatus={false} />
          </div>,
          document.body,
        )}
    </section>
  );
}
