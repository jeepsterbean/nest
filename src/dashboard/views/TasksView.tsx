import {
  useEffect,
  useMemo,
  useState,
  type CSSProperties,
  type FormEvent,
} from "react";
import { createTask } from "../../lib/commands";
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

const EMPTY_BY_STATUS: Record<TaskStatus, string> = {
  backlog: "",
  active: "",
  paused: "",
  completed: "",
  cancelled: "",
};

export function TasksView() {
  const { tasks, scopeTree, mutate } = useDashboardData();
  const [taskView, setTaskView] = useState<"kanban" | "table" | "matrix">(
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
      (t) => t.status === "backlog" || t.status === "active",
    );
    const scored = open.filter((t) => t.value !== null && t.effort !== null);
    const unscored = open.filter((t) => t.value === null || t.effort === null);
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
            Move work through backlog, active, paused and done
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
                <section className="task-column" key={status}>
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
                    <th>Status</th>
                    <th>Priority</th>
                    <th>Created</th>
                    <th>Updated</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleTasks.length === 0 ? (
                    <tr>
                      <td colSpan={6} className="task-table__empty">
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
                            <StatusTrigger task={task} />
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
        </div>
      </div>
    </section>
  );
}
