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
import { eyeOffIcon, plusIcon } from "../components/icons";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import type { CorePaneControls } from "../lib/corePane";
import { scopeMatches } from "../lib/scope";
import {
  canHideTaskTableColumn,
  HIDDEN_COLUMN_NAMES_LIMIT,
  hiddenColumnsLabel,
  readTaskView,
  TASK_VIEWS,
  TASK_TABLE_COLUMNS,
  writeTaskView,
} from "../lib/taskTable";
import {
  WORKING_STATUSES,
  TASK_STATUSES,
  TASK_STATUS_LABEL,
  matchingTaskStatusPreset,
} from "../lib/tasks";
import { TaskTableHeaderMenu } from "../task/TaskTableHeaderMenu";
import { sortTasksByColumn, taskSortDirectionLabel, type TaskColumnSort } from "../lib/taskColumnSort";
import {
  EMPTY_TASK_DRAFT,
  TaskCreateCard,
  type TaskDraft,
} from "../task/TaskCreateCard";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskMap } from "../task/TaskMap";
import { TaskTable } from "../task/TaskTable";

export function TasksView({ pane }: Pick<CorePaneControls, "pane">) {
  const { tasks, scopeTree, taskGraph, loaded, reload, setError } =
    useDashboardData();
  const [taskView, setTaskView] = useState(readTaskView);
  const [tableStatuses, setTableStatuses] =
    useState<TaskStatus[]>(WORKING_STATUSES);
  const [tableSort, setTableSort] = useState<TaskColumnSort | null>(null);
  const tableColumns = useTaskTableColumns();
  const [openHeaderMenu, setOpenHeaderMenu] = useState<string | null>(null);
  const [composerTitle, setComposerTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(EMPTY_TASK_DRAFT);
  const newTaskButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
  const [selectedTaskScope, setSelectedTaskScope] = useState<string | null>(
    null,
  );
  const [selectedParent, setSelectedParent] = useState<number | "none" | null>(null);
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
  // editors have had their turn at the key. Core keeps this pane mounted while
  // hidden, so the handler must not fire from another pane.
  const tasksPaneVisible = pane === "tasks";
  useEffect(() => {
    if (!tasksPaneVisible || taskView !== "table") setOpenHeaderMenu(null);
  }, [tasksPaneVisible, taskView]);
  useEffect(() => {
    if (selectedTaskId === null || !tasksPaneVisible) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (statusMenu || scopeMenu || creatingTask) return;
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, tasksPaneVisible, statusMenu, scopeMenu, creatingTask, closeDetail]);

  useEffect(() => {
    if (!tasksPaneVisible || taskView !== "table") setCreatingTask(false);
  }, [tasksPaneVisible, taskView]);

  const openTaskCreate = () => {
    // An untouched draft picks up the Scope the table is filtered to.
    if (taskDraft === EMPTY_TASK_DRAFT) {
      setTaskDraft({ ...EMPTY_TASK_DRAFT, scope: selectedTaskScope });
    }
    setCreatingTask(true);
  };

  const closeTaskCreate = useCallback(() => {
    setCreatingTask(false);
    newTaskButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (selectedTaskScope !== null && !scopeTree.paths.has(selectedTaskScope)) {
      setSelectedTaskScope(null);
    }
  }, [scopeTree.paths, selectedTaskScope]);

  const scopedTasks = useMemo(
    () => tasks.filter((task) => scopeMatches(task.scope, selectedTaskScope)),
    [tasks, selectedTaskScope],
  );
  const tableTasks = useMemo(
    () => scopedTasks.filter((task) => tableStatuses.includes(task.status) && (selectedParent === null || (selectedParent === "none" ? task.parentTaskId === null : task.parentTaskId === selectedParent))),
    [scopedTasks, tableStatuses, selectedParent],
  );
  const emptyListCopy =
    tasks.length === 0
      ? "Nothing on the board yet — add the first task."
      : scopedTasks.length === 0
        ? "No tasks in this scope yet."
        : tableStatuses.length === 0
          ? "Choose at least one status."
          : "No tasks match these filters.";

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

  useEffect(() => {
    if (typeof selectedParent === "number" && !taskGraph.byId.has(selectedParent)) setSelectedParent(null);
  }, [selectedParent, taskGraph]);

  const statusPreset = matchingTaskStatusPreset(tableStatuses);
  const filterPills = [
    ...(statusPreset === "all" ? [] : [{ label: `Status: ${statusPreset === "open" ? "Open" : statusPreset === "closed" ? "Closed" : tableStatuses.map(status => TASK_STATUS_LABEL[status]).join(", ") || "None"}`, remove: () => setTableStatuses([...TASK_STATUSES]) }]),
    ...(selectedTaskScope === null ? [] : [{ label: `Scope: ${selectedTaskScope}`, remove: () => setSelectedTaskScope(null) }]),
    ...(selectedParent === null ? [] : [{ label: `Parent: ${selectedParent === "none" ? "No parent" : taskGraph.byId.get(selectedParent)?.title ?? "Parent"}`, remove: () => setSelectedParent(null) }]),
    ...(tableSort === null ? [] : [{ label: `Sort: ${TASK_TABLE_COLUMNS.find(column => column.id === tableSort.column)?.label}, ${taskSortDirectionLabel(tableSort)}`, remove: () => setTableSort(null) }]),
  ];

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

  return (
    <section className="dash-section dash-section--tasks" aria-busy={!loaded}>
      <header className="dash-section__head task-header">
        <ViewToggle
          value={taskView}
          options={TASK_VIEWS}
          label="Task view"
          onChange={(key) => {
            writeTaskView(key);
            setTaskView(key);
            // Map always shows every scope.
            if (key === "map") setSelectedTaskScope(null);
          }}
        />
      </header>

      {!loaded ? (
        <div className="task-board__loading">Laying out the board…</div>
      ) : (
        <div
          className={`task-workspace${selectedTask ? " task-workspace--detail" : ""}${taskView === "map" ? " task-workspace--map" : ""}`}
        >
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
                <div className="task-table-toolbar">
                  <div className="task-table-summary" aria-label="Task count, active filters and sorting">
                    <span className="task-filter-result" role="status">
                      {tableTasks.length === tasks.length
                        ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
                        : `${tableTasks.length} of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`}
                    </span>
                    {filterPills.map(pill => <span className="task-filter-pill" key={pill.label}>
                      <span title={pill.label}>{pill.label}</span>
                      <button type="button" aria-label={`Remove ${pill.label}`} onClick={pill.remove}>×</button>
                    </span>)}
                    {tableColumns.hiddenColumns.length > 0 && <span className="task-filter-pill task-filter-pill--columns">
                      <span className="task-filter-pill__icon" aria-hidden="true">{eyeOffIcon}</span>
                      <span aria-label={`Hidden columns: ${tableColumns.hiddenColumns.map(column => column.label).join(", ")}`}>
                        {hiddenColumnsLabel(tableColumns.hiddenColumns)}
                      </span>
                      {tableColumns.hiddenColumns.length > HIDDEN_COLUMN_NAMES_LIMIT && <span className="task-filter-pill__names">
                        <span className="task-filter-pill__names-title">Hidden columns</span>
                        <ul>{tableColumns.hiddenColumns.map(column => <li key={column.id}>
                          <span>{column.label}</span>
                          <button type="button" aria-label={`Show ${column.label} column`} onClick={() => tableColumns.showColumn(column.id)}>×</button>
                        </li>)}</ul>
                      </span>}
                      <button type="button" aria-label="Show all columns" onClick={tableColumns.showAllColumns}>×</button>
                    </span>}
                    {filterPills.length > 1 && <button type="button" className="task-filter-clear" onClick={() => filterPills.forEach(pill => pill.remove())}>
                      Clear all
                    </button>}
                  </div>
                  <button
                    ref={newTaskButtonRef}
                    type="button"
                    className="task-new-button"
                    aria-haspopup="dialog"
                    aria-expanded={creatingTask}
                    onClick={openTaskCreate}
                  >
                    {plusIcon}
                    New task
                  </button>
                </div>
                <TaskTable
                wrapRef={tableColumns.wrapRef}
                columns={tableColumns.visibleColumns}
                tasks={sortTasksByColumn(tableTasks, tableSort, taskGraph.byId)}
                headerSort={tableSort ?? undefined}
                renderHeader={(column) => (
                  <TaskTableHeaderMenu
                    column={column}
                    open={openHeaderMenu === column.id}
                    onOpenChange={(open) => setOpenHeaderMenu(open ? column.id : null)}
                    tasks={tasks}
                    scopeTree={scopeTree}
                    statuses={tableStatuses}
                    onStatusesChange={setTableStatuses}
                    scope={selectedTaskScope}
                    onScopeChange={setSelectedTaskScope}
                    parent={selectedParent}
                    onParentChange={setSelectedParent}
                    sort={tableSort}
                    onSortChange={setTableSort}
                    onHide={canHideTaskTableColumn(column.id) ? () => tableColumns.hideColumn(column.id) : undefined}
                  />
                )}
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
          {creatingTask && (
            <TaskCreateCard
              draft={taskDraft}
              onDraftChange={setTaskDraft}
              onClose={closeTaskCreate}
              onCreated={(created) => {
                setTaskDraft(EMPTY_TASK_DRAFT);
                setCreatingTask(false);
                selectTask(created.id, newTaskButtonRef.current ?? undefined);
              }}
            />
          )}
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
