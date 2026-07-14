import {
  lazy,
  Suspense,
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
  type FormEvent,
  type MouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { createTask, setTaskStatus } from "../../lib/commands";
import type { TaskStatus } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { scopeMatches, type ScopeNode } from "../lib/scope";
import { groupTasksByStatus, TASK_STATUS_LABEL, TASK_STATUSES } from "../lib/tasks";
import { formatDate } from "../lib/time";
import { StatusTrigger } from "../task/StatusTrigger";
import { TaskCard } from "../task/TaskCard";
import { TaskScopeButton } from "../task/TaskScopeButton";
import { TaskScoreControls } from "../task/TaskScoreControls";
import { TaskTitle } from "../task/TaskTitle";
import { TaskGraphBadges } from "../task/TaskRelations";
import { isTaskBlocked } from "../lib/taskGraph";

const TaskGraphView = lazy(() =>
  import("../task/TaskGraphView").then((module) => ({
    default: module.TaskGraphView,
  })),
);

const EMPTY_BY_STATUS: Record<TaskStatus, string> = {
  backlog: "",
  up_next: "",
  active: "",
  paused: "",
  completed: "",
  cancelled: "",
};

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
  const { tasks, scopeTree, taskGraph, mutate } = useDashboardData();
  const [taskView, setTaskView] = useState<"kanban" | "table" | "matrix" | "graph">(
    "kanban",
  );
  const [newTaskTitles, setNewTaskTitles] =
    useState<Record<TaskStatus, string>>(EMPTY_BY_STATUS);
  const [newTaskDescriptions, setNewTaskDescriptions] =
    useState<Record<TaskStatus, string>>(EMPTY_BY_STATUS);
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());
  const [selectedTaskScope, setSelectedTaskScope] = useState<string | null>(
    null,
  );
  const [collapsedScopePaths, setCollapsedScopePaths] = useState<Set<string>>(
    new Set(),
  );
  const [draggedTaskId, setDraggedTaskId] = useState<number | null>(null);
  const [dragOverStatus, setDragOverStatus] = useState<TaskStatus | null>(null);
  const [dragPreview, setDragPreview] = useState<TaskDragPreview | null>(null);
  const dragSessionRef = useRef<TaskDragSession | null>(null);
  const suppressClickTaskIdRef = useRef<number | null>(null);

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

  const onCreateTask = async (e: FormEvent, status: TaskStatus) => {
    e.preventDefault();
    const title = newTaskTitles[status].trim();
    if (!title) return;
    const description = newTaskDescriptions[status].trim();
    if (await mutate(() => createTask(title, description, status))) {
      setNewTaskTitles((prev) => ({ ...prev, [status]: "" }));
      setNewTaskDescriptions((prev) => ({ ...prev, [status]: "" }));
    }
  };

  const toggleTaskExpanded = (id: number) => {
    setExpandedTaskIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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
    if (
      (e.target as HTMLElement).closest(
        "input, textarea, select, [contenteditable='true']",
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
        <div
          className="task-scope-tree__row"
          style={{ "--scope-depth": node.depth } as CSSProperties}
        >
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
            <span className="task-scope-tree__label">{node.label}</span>
          </button>
          <button
            type="button"
            className="task-scope-tree__count"
            onClick={() => hasChildren && toggleScopeCollapsed(node.path)}
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

  const renderTaskMatrix = () => {
    const open = visibleTasks.filter(
      (t) =>
        t.status === "backlog" ||
        t.status === "up_next" ||
        t.status === "active",
    );
    const readyOpen = open.filter((task) => !isTaskBlocked(taskGraph, task.id));
    const blockedOpen = open.filter((task) => isTaskBlocked(taskGraph, task.id));
    const scored = readyOpen.filter((t) => t.value !== null && t.effort !== null);
    const unscored = readyOpen.filter((t) => t.value === null || t.effort === null);
    const ranked = [...scored].sort(
      (a, b) =>
        (b.value ?? 0) - (a.value ?? 0) ||
        (a.effort ?? 0) - (b.effort ?? 0) ||
        b.updatedAt - a.updatedAt,
    );
    return (
      <div className="task-matrix-layout">
        <div className="task-matrix">
          <span className="task-matrix__axis task-matrix__axis--value">
            Value
          </span>
          <div className="task-matrix__plot">
            <div className="task-matrix__quadrants" aria-hidden="true">
              <span className="task-matrix__quadrant">Quick wins</span>
              <span className="task-matrix__quadrant">Big bets</span>
              <span className="task-matrix__quadrant">Fill-ins</span>
              <span className="task-matrix__quadrant">Thankless</span>
            </div>
            {scored.length === 0 ? (
              <p className="task-matrix__empty">
                Score a task's value and effort to place it here.
              </p>
            ) : (
              scored.map((task) => {
                const x = 8 + (((task.effort ?? 3) - 1) / 4) * 84;
                const y = 8 + (((task.value ?? 3) - 1) / 4) * 84;
                return (
                  <span
                    key={task.id}
                    className="task-matrix__chip"
                    style={{ left: `${x}%`, bottom: `${y}%` }}
                    title={`${task.title} · value ${task.value}, effort ${task.effort}`}
                  >
                    {task.title}
                  </span>
                );
              })
            )}
          </div>
          <span className="task-matrix__axis task-matrix__axis--effort">
            Effort
          </span>
        </div>
        <div className="task-ranked">
          <h3 className="task-ranked__head">Do next</h3>
          {ranked.length === 0 ? (
            <p className="task-ranked__empty">Score some tasks to rank them.</p>
          ) : (
            <ol className="task-ranked__list">
              {ranked.map((task, i) => (
                <li key={task.id} className="task-ranked__item">
                  <span className="task-ranked__rank">{i + 1}</span>
                  <span className="task-ranked__title">{task.title}</span>
                  <span className="task-ranked__badges">
                    <span className="task-badge" title="Value">
                      V{task.value}
                    </span>
                    <span className="task-badge" title="Effort">
                      E{task.effort}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {unscored.length > 0 && (
            <div className="task-ranked__unscored">
              <h4 className="task-ranked__subhead">Needs scoring</h4>
              <ol className="task-ranked__list">
                {unscored.map((task) => (
                  <li
                    key={task.id}
                    className="task-ranked__item task-ranked__item--unscored"
                  >
                    <span className="task-ranked__title">{task.title}</span>
                    <TaskScoreControls task={task} />
                  </li>
                ))}
              </ol>
            </div>
          )}
          {blockedOpen.length > 0 && (
            <p className="task-ranked__blocked">
              {blockedOpen.length} {blockedOpen.length === 1 ? "task is" : "tasks are"} waiting on blockers.
            </p>
          )}
        </div>
      </div>
    );
  };

  return (
    <section className="dash-section dash-section--tasks">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Tasks</h2>
          <span className="dash-section__sub">
            Move work through backlog, up next, active, paused and done
          </span>
        </div>
        <div className="view-toggle" role="group" aria-label="Task view">
          <button
            type="button"
            className={
              taskView === "kanban"
                ? "view-toggle__btn view-toggle__btn--active"
                : "view-toggle__btn"
            }
            onClick={() => setTaskView("kanban")}
          >
            Kanban
          </button>
          <button
            type="button"
            className={
              taskView === "table"
                ? "view-toggle__btn view-toggle__btn--active"
                : "view-toggle__btn"
            }
            onClick={() => setTaskView("table")}
          >
            Table
          </button>
          <button
            type="button"
            className={
              taskView === "matrix"
                ? "view-toggle__btn view-toggle__btn--active"
                : "view-toggle__btn"
            }
            onClick={() => setTaskView("matrix")}
          >
            Matrix
          </button>
          <button
            type="button"
            className={
              taskView === "graph"
                ? "view-toggle__btn view-toggle__btn--active"
                : "view-toggle__btn"
            }
            onClick={() => setTaskView("graph")}
          >
            Graph
          </button>
        </div>
      </header>

      <div
        className={
          scopeTree.roots.length > 0
            ? "task-workspace"
            : "task-workspace task-workspace--no-scopes"
        }
      >
        {scopeTree.roots.length > 0 && (
          <aside className="task-scope-panel" aria-label="Task scopes">
            <div className="task-scope-panel__head">
              <span>Scopes</span>
              <span>{tasks.length}</span>
            </div>
            <button
              type="button"
              className={
                selectedTaskScope === null
                  ? "task-scope-tree__btn task-scope-tree__btn--all task-scope-tree__btn--active"
                  : "task-scope-tree__btn task-scope-tree__btn--all"
              }
              onClick={() => setSelectedTaskScope(null)}
            >
              <span className="task-scope-tree__label">All tasks</span>
              <span className="task-scope-tree__count">{tasks.length}</span>
            </button>
            <ol className="task-scope-tree">
              {scopeTree.roots.map(renderScopeNode)}
            </ol>
          </aside>
        )}

        <div className="task-workspace__main">
          {taskView === "kanban" && (
            <div className="task-board">
              {TASK_STATUSES.map((status) => (
                <section
                  className={`task-column${
                    dragOverStatus === status
                      ? " task-column--drag-over"
                      : ""
                  }`}
                  key={status}
                  data-task-status={status}
                >
                  <header className="task-column__head">
                    <h3>{TASK_STATUS_LABEL[status]}</h3>
                    <span>{visibleTasksByStatus[status].length}</span>
                  </header>
                  <form
                    className="task-create"
                    onSubmit={(e) => onCreateTask(e, status)}
                  >
                    <div className="task-create__row">
                      <input
                        type="text"
                        placeholder={`Add to ${TASK_STATUS_LABEL[status].toLowerCase()}…`}
                        aria-label={`New ${TASK_STATUS_LABEL[status]} task`}
                        value={newTaskTitles[status]}
                        onChange={(e) =>
                          setNewTaskTitles((prev) => ({
                            ...prev,
                            [status]: e.target.value,
                          }))
                        }
                      />
                      <button
                        type="submit"
                        disabled={!newTaskTitles[status].trim()}
                      >
                        Add
                      </button>
                    </div>
                    <input
                      type="text"
                      className="task-create__description"
                      placeholder="Description (optional)…"
                      aria-label={`New ${TASK_STATUS_LABEL[status]} task description`}
                      value={newTaskDescriptions[status]}
                      onChange={(e) =>
                        setNewTaskDescriptions((prev) => ({
                          ...prev,
                          [status]: e.target.value,
                        }))
                      }
                    />
                  </form>
                  {visibleTasksByStatus[status].length === 0 ? (
                    <div className="task-column__empty">No tasks</div>
                  ) : (
                    <ol className="task-card-list">
                      {visibleTasksByStatus[status].map((task) => (
                        <TaskCard
                          key={task.id}
                          task={task}
                          expanded={expandedTaskIds.has(task.id)}
                          onToggleExpand={() => toggleTaskExpanded(task.id)}
                          showStatus={false}
                          draggable
                          dragging={draggedTaskId === task.id}
                          onPointerDown={(e) =>
                            onTaskPointerDown(e, task.id)
                          }
                          onClickCapture={(e) =>
                            onTaskClickCapture(e, task.id)
                          }
                        />
                      ))}
                    </ol>
                  )}
                </section>
              ))}
            </div>
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
                        <tr key={task.id}>
                          <td>
                            <TaskTitle task={task} />
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
                            <StatusTrigger task={task} />
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
          {taskView === "matrix" && renderTaskMatrix()}
          {taskView === "graph" && (
            <Suspense
              fallback={
                <div className="task-graph-empty">Preparing task map…</div>
              }
            >
              <TaskGraphView visibleTasks={visibleTasks} />
            </Suspense>
          )}
        </div>
      </div>
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
            <TaskCard
              task={previewTask}
              expanded={expandedTaskIds.has(previewTask.id)}
              onToggleExpand={() => undefined}
              showStatus={false}
            />
          </div>,
          document.body,
        )}
    </section>
  );
}
