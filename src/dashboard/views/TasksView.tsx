import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import { createTask } from "../../lib/commands";
import { plusIcon } from "../components/icons";
import { TaskFilterRules } from "../task/TaskFilterRules";
import { TaskSortRules } from "../task/TaskSortRules";
import { TaskHiddenColumnRules } from "../task/TaskHiddenColumnRules";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useMediaQuery } from "../hooks/useMediaQuery";
import { useAppSettings } from "../hooks/useAppSettings";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import { useTaskWorkedOn } from "../hooks/useTaskWorkedOn";
import { useTaskTableViews } from "../hooks/useTaskTableViews";
import { scopeMatches } from "../lib/scope";
import { COLLAPSED_SECTION_SIDEBAR } from "../lib/sections";
import {
  canHideTaskTableColumn,
  TASK_VIEWS,
  visibleTaskViewFor,
  type TaskTableColumn,
  type TaskViewKey,
} from "../lib/taskTable";
import { TaskTableHeaderMenu, type TaskFilterContext } from "../task/TaskTableHeaderMenu";
import { taskMatchesTableRowFilters } from "../lib/taskTableFilter";
import { sortTasksByColumn, type TaskColumnSort } from "../lib/taskColumnSort";
import {
  changedTaskTableQueryFields,
  DEFAULT_TASK_TABLE_QUERY,
  taskTableColumnQueryEdited,
  taskTableFiltersEdited,
  type TaskParentFilter,
  type TaskTableFilterField,
  type TaskTableQuery,
} from "../lib/taskTableViews";
import { taskMatchesWorkedTimeFilter } from "../lib/taskWorkedTimeFilter";
import {
  EMPTY_TASK_DRAFT,
  TaskCreateCard,
  type TaskDraft,
} from "../task/TaskCreateCard";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskMap } from "../task/TaskMap";
import { TaskTable } from "../task/TaskTable";
import { useTaskStatusChanged } from "../hooks/useTaskStatusChanged";
import { TaskViewPicker } from "../task/TaskViewPicker";
import type { TaskTableColumnId } from "../lib/taskTable";

// Header menus, sidebar filter rows, and sidebar sort rows share one open
// slot, so opening any of them closes the others.
type TaskQueryMenu = TaskTableColumnId | `filter:${TaskTableFilterField}` | `sort:${TaskTableColumnId}`;

export function TasksView({
  sectionSidebar,
  sectionSidebarHead,
  visible,
}: {
  sectionSidebar: HTMLElement | null;
  sectionSidebarHead: HTMLElement | null;
  visible: boolean;
}) {
  const {
    tasks,
    scopeTree,
    taskGraph,
    loaded,
    reload,
    setError,
  } = useDashboardData();
  const [taskView, setTaskView] = useState<TaskViewKey>("table");
  const showTaskMap = useAppSettings().showTaskMap;
  const visibleTaskView = visibleTaskViewFor(taskView, showTaskMap);
  // Tasks stays mounted while hidden, so it must not fill another Section's
  // sidebar, and the collapsed sidebar is too thin for these controls.
  const collapsedSidebar = useMediaQuery(COLLAPSED_SECTION_SIDEBAR);
  const sidebar = visible && !collapsedSidebar ? sectionSidebar : null;
  const viewSwitch = showTaskMap && (
    <ViewToggle
      value={visibleTaskView}
      options={TASK_VIEWS}
      label="Tasks view"
      onChange={setTaskView}
    />
  );
  const taskTableViews = useTaskTableViews();
  const { query: tableQuery, setQuery: setTableQuery } = taskTableViews;
  const {
    statuses: tableStatuses,
    scope: selectedTaskScope,
    parent: selectedParent,
    workedOn: workedOnFilter,
    statusChanged: statusChangedFilter,
    workedTime: workedTimeFilter,
    sort: tableSort,
  } = tableQuery;
  const patchTableQuery = (patch: Partial<TaskTableQuery>) => setTableQuery(q => ({ ...q, ...patch }));
  const setSelectedTaskScope = (scope: string | null) => patchTableQuery({ scope });
  const setSelectedParent = (parent: TaskParentFilter) => patchTableQuery({ parent });
  const setTableSort = (sort: TaskColumnSort[]) => patchTableQuery({ sort });
  // One table clock keeps displayed, filtered, and sorted live totals aligned.
  const tickWorkedTime = visibleTaskView === "table" && (
    tasks.some(task => task.workingNow)
    || workedTimeFilter !== null
    || tableSort.some(rule => rule.column === "workedTime")
  );
  const dateNowMs = useCurrentTime();
  const [workedNowMs, setWorkedNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!tickWorkedTime) return;
    setWorkedNowMs(Date.now());
    const id = window.setInterval(() => setWorkedNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [tickWorkedTime]);
  const nowMs = tickWorkedTime ? workedNowMs : dateNowMs;
  const workHistory = useTaskWorkedOn(workedOnFilter, nowMs, visibleTaskView === "table");
  const statusHistory = useTaskStatusChanged(statusChangedFilter, nowMs, visibleTaskView === "table");
  const { workedSecondsByTask } = workHistory;
  const historyMatches = useMemo(
    () => ({ workedOn: workHistory.workedTaskIds, statusChanged: statusHistory.taskIds }),
    [workHistory.workedTaskIds, statusHistory.taskIds],
  );
  const historyLoading = workHistory.loading || statusHistory.loading;
  const historyFailed = workHistory.failed || statusHistory.failed;
  const retryHistory = () => {
    if (workHistory.failed) workHistory.retry();
    if (statusHistory.failed) statusHistory.retry();
  };
  const historyName = workHistory.loading || workHistory.failed ? "Work history" : "Status history";
  const historyStatus = historyLoading ? `Loading ${historyName.toLowerCase()}…` : historyFailed ? `${historyName} unavailable` : null;
  const setTableColumns = useCallback(
    (columns: TaskTableColumn[]) => setTableQuery(q => ({ ...q, columns })),
    [setTableQuery],
  );
  const tableColumns = useTaskTableColumns(tableQuery.columns, setTableColumns);
  const [openQueryMenu, setOpenQueryMenu] = useState<TaskQueryMenu | null>(null);
  const [composerTitle, setComposerTitle] = useState("");
  const [creatingTask, setCreatingTask] = useState(false);
  const [taskDraft, setTaskDraft] = useState<TaskDraft>(EMPTY_TASK_DRAFT);
  const newTaskButtonRef = useRef<HTMLButtonElement | null>(null);
  const [selectedTaskId, setSelectedTaskId] = useState<number | null>(null);
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

  // Hiding Map from Settings lands on Table, where a kept selection would open
  // the modal Task detail behind the Settings overlay.
  const mapHidden = taskView === "map" && !showTaskMap;
  useEffect(() => {
    if (mapHidden) setSelectedTaskId(null);
  }, [mapHidden]);

  // Escape closes the detail panel, but only once open menus and in-place
  // editors have had their turn at the key. Tasks stays mounted while
  // hidden, so the handler must not fire from another Section.
  useEffect(() => {
    if (!visible) {
      setTaskView("table");
      setSelectedTaskId(null);
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || visibleTaskView !== "table") setOpenQueryMenu(null);
  }, [visible, visibleTaskView]);
  useEffect(() => {
    if (selectedTaskId === null || !visible) return;
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
  }, [selectedTaskId, visible, statusMenu, scopeMenu, creatingTask, closeDetail]);

  useEffect(() => {
    setCreatingTask(false);
  }, [visible, visibleTaskView]);

  const openTaskCreate = () => {
    // An untouched draft picks up the table's Scope, and its Status when the
    // view shows only one, so the new Task lands in the view it was added from.
    if (taskDraft === EMPTY_TASK_DRAFT && visibleTaskView === "table") {
      const status = tableStatuses.length === 1 ? tableStatuses[0]! : EMPTY_TASK_DRAFT.status;
      setTaskDraft({ ...EMPTY_TASK_DRAFT, scope: selectedTaskScope, status });
    }
    setCreatingTask(true);
  };

  const closeTaskCreate = useCallback(() => {
    setCreatingTask(false);
    newTaskButtonRef.current?.focus();
  }, []);

  useEffect(() => {
    if (loaded && selectedTaskScope !== null && !scopeTree.paths.has(selectedTaskScope)) {
      setSelectedTaskScope(null);
    }
  }, [loaded, scopeTree.paths, selectedTaskScope]);

  const scopedTasks = useMemo(
    () => tasks.filter((task) => scopeMatches(task.scope, selectedTaskScope)),
    [tasks, selectedTaskScope],
  );
  const tableTasksWithoutWorkedTime = useMemo(
    () => tasks.filter((task) => taskMatchesTableRowFilters(task, tableQuery, historyMatches, dateNowMs)),
    [tasks, tableQuery, historyMatches, dateNowMs],
  );
  const tableTasks = useMemo(
    () => tableTasksWithoutWorkedTime.filter((task) => taskMatchesWorkedTimeFilter(task, workedTimeFilter, nowMs, workedSecondsByTask?.get(task.id))),
    [tableTasksWithoutWorkedTime, workedTimeFilter, nowMs, workedSecondsByTask],
  );
  const emptyListCopy =
    historyLoading ? `Loading ${historyName.toLowerCase()}…`
      : historyFailed ? `${historyName} could not be loaded.`
      : tasks.length === 0
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
      // The Map is never scope-filtered, so its composer adds unscoped Tasks.
      const created = await createTask(title, "", "active", null);
      await reload();
      setComposerTitle("");
      selectTask(created.id);
    } catch (error) {
      setError(String(error));
    }
  };

  useEffect(() => {
    if (loaded && typeof selectedParent === "number" && !taskGraph.byId.has(selectedParent)) setSelectedParent(null);
  }, [loaded, selectedParent, taskGraph]);

  const changedFields = changedTaskTableQueryFields(taskTableViews.selected.query, tableQuery);
  const filtersEdited = taskTableFiltersEdited(taskTableViews.selected.query, tableQuery);
  const filterContext: TaskFilterContext = {
    tasks,
    scopeTree,
    workedTimeCandidates: tableTasksWithoutWorkedTime,
    workedSecondsByTask,
    workHistoryStatus: historyStatus,
  };
  const savedHiddenColumnIds = new Set(
    taskTableViews.selected.query.columns.filter(column => column.hidden).map(column => column.id),
  );

  const tableQueryPanel = (
    <div className="task-query">
      {!sidebar && <TaskViewPicker views={taskTableViews} />}
      <TaskFilterRules query={tableQuery} onQueryChange={patchTableQuery} changedFields={changedFields}
        context={filterContext} nowMs={dateNowMs}
        openField={openQueryMenu?.startsWith("filter:") ? openQueryMenu.slice("filter:".length) as TaskTableFilterField : null}
        onOpenFieldChange={field => setOpenQueryMenu(field ? `filter:${field}` : null)} />
      <TaskSortRules rules={tableSort} savedRules={taskTableViews.selected.query.sort} onChange={setTableSort}
        openColumn={openQueryMenu?.startsWith("sort:") ? openQueryMenu.slice("sort:".length) as TaskTableColumnId : null}
        onOpenColumnChange={column => setOpenQueryMenu(column ? `sort:${column}` : null)} />
      <TaskHiddenColumnRules columns={tableColumns.hiddenColumns} savedHiddenIds={savedHiddenColumnIds}
        onShow={tableColumns.showColumn} onShowAll={tableColumns.showAllColumns} />
      {!taskTableFiltersEdited(DEFAULT_TASK_TABLE_QUERY, tableQuery) && tableSort.length === 0 && tableColumns.hiddenColumns.length === 0
        && <p className="task-query__hint">Filter and sort from the column headers.</p>}
    </div>
  );

  const tableBar = (
    <div className="task-table-bar">
      <div className="task-table-bar__result">
        <span className="task-filter-result" role="status">
          {historyStatus ?? (filtersEdited
            ? `${tableTasks.length} out of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
            : `${tableTasks.length} ${tableTasks.length === 1 ? "task" : "tasks"}`)}
        </span>
        {historyFailed && <button type="button" className="task-filter-retry" onClick={retryHistory}>Retry</button>}
      </div>
      <button
        ref={newTaskButtonRef}
        type="button"
        className="task-new-button"
        aria-label="New task"
        title="New task"
        aria-haspopup="dialog"
        aria-expanded={creatingTask}
        onClick={openTaskCreate}
      >
        {plusIcon}
        New task
      </button>
    </div>
  );

  const composerForm = (
    <form className="task-composer" onSubmit={onComposerSubmit}>
      <input
        type="text"
        className="task-composer__title"
        placeholder="Add an active task…"
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
  const overlayDetailOpen = selectedTask !== null && visibleTaskView !== "map";

  return (
    <section className="dash-section dash-section--tasks" aria-busy={!loaded || historyLoading}>
      {sidebar && sectionSidebarHead && loaded && visibleTaskView === "table"
        && createPortal(<TaskViewPicker views={taskTableViews} />, sectionSidebarHead)}
      {sidebar && loaded && visibleTaskView === "table" && createPortal(tableQueryPanel, sidebar)}
      {showTaskMap && (
        <header className="dash-section__head task-header" inert={overlayDetailOpen}>
          <div className="task-header__actions">
            {viewSwitch}
          </div>
        </header>
      )}

      {!loaded ? (
        <div className="task-board__loading">Laying out the board…</div>
      ) : (
        <div
          className={`task-workspace${selectedTask && visibleTaskView === "map" ? " task-workspace--detail" : ""}${visibleTaskView === "map" ? " task-workspace--map" : ""}${overlayDetailOpen ? " task-workspace--overlay" : ""}`}
        >
          <div className="task-workspace__main" inert={overlayDetailOpen}>
            {visibleTaskView === "map" && (
              <TaskMap
                tasks={tasks}
                selectedTaskId={selectedTaskId}
                composer={composerForm}
                onSelect={selectTask}
              />
            )}
            {visibleTaskView === "table" && (
              <>
                {!sidebar && tableQueryPanel}
                {tableBar}
                <TaskTable
                wrapRef={tableColumns.wrapRef}
                columns={tableColumns.visibleColumns}
                tasks={sortTasksByColumn(tableTasks, tableSort, taskGraph.byId, nowMs, workedSecondsByTask)}
                headerSort={tableSort[0]}
                renderHeader={(column) => (
                  <TaskTableHeaderMenu
                    column={column}
                    edited={taskTableColumnQueryEdited(column.id, taskTableViews.selected.query, tableQuery)}
                    open={openQueryMenu === column.id}
                    onOpenChange={(open) => setOpenQueryMenu(open ? column.id : null)}
                    query={tableQuery}
                    onQueryChange={patchTableQuery}
                    filterContext={filterContext}
                    onHide={canHideTaskTableColumn(column.id) ? () => tableColumns.hideColumn(column.id) : undefined}
                  />
                )}
                taskGraph={taskGraph}
                nowMs={nowMs}
                workedSecondsByTask={workedSecondsByTask}
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
          {selectedTask && visibleTaskView === "map" && (
            <TaskDetailPanel
              key={selectedTask.id}
              task={selectedTask}
              onClose={closeDetail}
            />
          )}
          {selectedTask && overlayDetailOpen && (
            <div
              className="task-detail-overlay"
              onMouseDown={(e) => {
                // Status and Scope menus portal out of the panel; only a press
                // on the scrim itself dismisses.
                if (e.target === e.currentTarget) closeDetail();
              }}
            >
              <TaskDetailPanel
                key={selectedTask.id}
                task={selectedTask}
                onClose={closeDetail}
                modal
              />
            </div>
          )}
        </div>
      )}
    </section>
  );
}
