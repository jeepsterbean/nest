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
import { MenuSelect } from "../components/MenuSelect";
import { IconPickerButton } from "../components/PulseIcon";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import { useTileIcons } from "../hooks/useTileIcons";
import { writeTileIcon } from "../lib/tileIcons";
import { scopeMatches, type ScopeNode } from "../lib/scope";
import {
  readTaskView,
  TASK_VIEWS,
  writeTaskView,
} from "../lib/taskTable";
import {
  matchingTaskStatusPreset,
  sortTaskTable,
  TASK_STATUS_LABEL,
  TASK_STATUS_PRESETS,
  TASK_STATUSES,
  toggleTaskStatusFilter,
  WORKING_STATUSES,
  type TaskTableSort,
} from "../lib/tasks";
import { chevronDownIcon, chevronRightIcon } from "../components/icons";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskMap } from "../task/TaskMap";
import { TaskTable } from "../task/TaskTable";

const TASK_TABLE_SORT_OPTIONS = [
  { value: "status", label: "Sort: Status" },
  { value: "updated", label: "Sort: Recently updated" },
];

export function TasksView() {
  const { tasks, scopeTree, taskGraph, loaded, reload, setError } =
    useDashboardData();
  const icons = useTileIcons();
  const [taskView, setTaskView] = useState(readTaskView);
  const [tableStatuses, setTableStatuses] =
    useState<TaskStatus[]>(WORKING_STATUSES);
  const [tableSort, setTableSort] = useState<TaskTableSort>("status");
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
  const statusFilterRef = useRef<HTMLDetailsElement | null>(null);
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
      if (statusFilterRef.current?.open) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, statusMenu, scopeMenu, closeDetail]);

  useEffect(() => {
    const closeStatusFilter = (restoreFocus: boolean) => {
      const filter = statusFilterRef.current;
      if (!filter?.open) return;
      filter.open = false;
      if (restoreFocus) filter.querySelector<HTMLElement>("summary")?.focus();
    };
    const onPointerDown = (event: PointerEvent) => {
      const filter = statusFilterRef.current;
      if (filter?.open && !filter.contains(event.target as Node)) {
        closeStatusFilter(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") closeStatusFilter(true);
    };
    document.addEventListener("pointerdown", onPointerDown);
    document.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      document.removeEventListener("keydown", onKeyDown);
    };
  }, []);

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
  const showScopePanel = taskView === "table" && scopeTree.roots.length > 0;
  const tableTasks = useMemo(
    () => scopedTasks.filter((task) => tableStatuses.includes(task.status)),
    [scopedTasks, tableStatuses],
  );
  const tableStatusPreset = matchingTaskStatusPreset(tableStatuses);
  const emptyListCopy =
    tasks.length === 0
      ? "Nothing on the board yet — name the first task above."
      : scopedTasks.length === 0
        ? "No tasks in this scope yet."
        : tableStatuses.length === 0
          ? "Choose at least one status."
          : "No tasks match these statuses.";

  const onComposerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const title = composerTitle.trim();
    if (!title) return;
    try {
      const created = await createTask(title, "", "active", selectedTaskScope);
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

  const composerForm = (
    <form className="task-composer" onSubmit={onComposerSubmit}>
      <input
        type="text"
        className="task-composer__title"
        placeholder={
          selectedTaskScope
            ? `Add an active task in ${selectedTaskScope}…`
            : "Add an active task…"
        }
        aria-label="New active task title"
        value={composerTitle}
        onChange={(e) => setComposerTitle(e.target.value)}
      />
      <button type="submit" className="btn-accent" disabled={!composerTitle.trim()}>
        Add
      </button>
    </form>
  );

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

  return (
    <section className="dash-section dash-section--tasks" aria-busy={!loaded}>
      <header className="dash-section__head">
        <div className="dash-toolbar">
          {taskView === "table" && (
            <>
              <ViewToggle
                value={tableStatusPreset}
                options={TASK_STATUS_PRESETS}
                label="Task status preset"
                onChange={(key) => {
                  const preset = TASK_STATUS_PRESETS.find((item) => item.key === key);
                  if (preset) setTableStatuses([...preset.statuses]);
                }}
              />
              <details ref={statusFilterRef} className="task-status-filter">
                <summary className="task-status-filter__trigger">
                  Status{tableStatusPreset ? "" : ` (${tableStatuses.length})`}
                  {chevronDownIcon}
                </summary>
                <div className="task-status-filter__menu">
                  {TASK_STATUSES.map((status) => (
                    <label className="task-status-filter__option" key={status}>
                      <input
                        type="checkbox"
                        checked={tableStatuses.includes(status)}
                        onChange={() =>
                          setTableStatuses((selected) =>
                            toggleTaskStatusFilter(selected, status),
                          )
                        }
                      />
                      <span
                        className={`status-dot status-dot--${status}`}
                        aria-hidden="true"
                      />
                      <span>{TASK_STATUS_LABEL[status]}</span>
                      <span className="task-status-filter__count">
                        {
                          scopedTasks.filter((task) => task.status === status)
                            .length
                        }
                      </span>
                    </label>
                  ))}
                </div>
              </details>
              <MenuSelect
                className="task-table-sort"
                value={tableSort}
                options={TASK_TABLE_SORT_OPTIONS}
                placeholder="Sort"
                ariaLabel="Sort tasks"
                onChange={(value) => setTableSort(value as TaskTableSort)}
              />
            </>
          )}
          <ViewToggle
            value={taskView}
            options={TASK_VIEWS}
            label="Task view"
            onChange={(key) => {
              writeTaskView(key);
              setTaskView(key);
              // The map has no scope tree, so it must not stay scope-filtered.
              if (key === "map") setSelectedTaskScope(null);
            }}
          />
        </div>
        <IconPickerButton
          className="dash-section__tile-icon"
          icon={icons.tasks}
          label="Tasks"
          onChange={(nextIcon) => writeTileIcon("tasks", nextIcon)}
        />
      </header>

      {!loaded ? (
        <div className="task-board__loading">Laying out the board…</div>
      ) : (
        <div
          className={`task-workspace${
            showScopePanel ? "" : " task-workspace--no-scopes"
          }${selectedTask ? " task-workspace--detail" : ""}${
            showScopePanel && scopePanelCollapsed
              ? " task-workspace--scope-collapsed"
              : ""
          }${taskView === "map" ? " task-workspace--map" : ""}`}
        >
          {showScopePanel && (
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
            {taskView === "map" && (
              <TaskMap
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                composer={composerForm}
                onSelect={selectTask}
              />
            )}
            {taskView === "table" && (
              <>
                {composerForm}
                <TaskTable
                columns={tableColumns.columns}
                tasks={sortTaskTable(tableTasks, tableSort)}
                taskGraph={taskGraph}
                selectedTaskId={selectedTaskId}
                emptyCopy={emptyListCopy}
                onSelect={selectTask}
                columnInteraction={{
                  draggingId: tableColumns.draggingId,
                  overId: tableColumns.overId,
                  onMovePointerDown: tableColumns.onMovePointerDown,
                  onResizePointerDown: tableColumns.onResizePointerDown,
                }}
                />
              </>
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
