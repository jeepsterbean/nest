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
import type { TaskStatus } from "../../lib/types";
import { eyeOffIcon, plusIcon } from "../components/icons";
import { TaskFilterRules } from "../task/TaskFilterRules";
import { TaskSortRules } from "../task/TaskSortRules";
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
import {
  TASK_STATUSES,
  matchingTaskStatusPreset,
  taskStatusFilterLabel,
} from "../lib/tasks";
import { TaskTableHeaderMenu } from "../task/TaskTableHeaderMenu";
import { taskDateFilterLabel, type TaskDateFilter } from "../lib/taskDateFilter";
import { taskScoreFilterLabel, type TaskScoreFilter } from "../lib/taskScoreFilter";
import { taskMatchesTableRowFilters } from "../lib/taskTableFilter";
import { sortTasksByColumn, type TaskColumnSort } from "../lib/taskColumnSort";
import { changedTaskTableQueryFields, taskTableColumnQueryEdited, taskTableFiltersEdited, type TaskParentFilter, type TaskTableQuery } from "../lib/taskTableViews";
import { taskMatchesWorkedTimeFilter, taskWorkedTimeFilterLabel, type TaskWorkedTimeFilter } from "../lib/taskWorkedTimeFilter";
import {
  EMPTY_TASK_DRAFT,
  TaskCreateCard,
  type TaskDraft,
} from "../task/TaskCreateCard";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskMap } from "../task/TaskMap";
import { TaskTable } from "../task/TaskTable";
import { TaskWorkedOnFilter } from "../task/TaskWorkedOnFilter";
import { TaskViewPicker } from "../task/TaskViewPicker";

type TableFilterRule = {
  field: keyof TaskTableQuery;
  name: string;
  value: string;
  remove: () => void;
};

const optionalRule = (field: TableFilterRule["field"], name: string, value: string | null, remove: () => void): TableFilterRule[] =>
  value === null ? [] : [{ field, name, value, remove }];

export function TasksView({
  sectionSidebar,
  visible,
}: {
  sectionSidebar: HTMLElement | null;
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
    created: createdFilter,
    updated: updatedFilter,
    closed: closedFilter,
    workedOn: workedOnFilter,
    value: valueFilter,
    effort: effortFilter,
    workedTime: workedTimeFilter,
    sort: tableSort,
  } = tableQuery;
  const setTableStatuses = (statuses: TaskStatus[]) => setTableQuery(q => ({ ...q, statuses }));
  const setSelectedTaskScope = (scope: string | null) => setTableQuery(q => ({ ...q, scope }));
  const setSelectedParent = (parent: TaskParentFilter) => setTableQuery(q => ({ ...q, parent }));
  const setCreatedFilter = (created: TaskDateFilter) => setTableQuery(q => ({ ...q, created }));
  const setUpdatedFilter = (updated: TaskDateFilter) => setTableQuery(q => ({ ...q, updated }));
  const setClosedFilter = (closed: TaskDateFilter) => setTableQuery(q => ({ ...q, closed }));
  const setWorkedOnFilter = (workedOn: TaskDateFilter) => setTableQuery(q => ({ ...q, workedOn }));
  const setValueFilter = (value: TaskScoreFilter) => setTableQuery(q => ({ ...q, value }));
  const setEffortFilter = (effort: TaskScoreFilter) => setTableQuery(q => ({ ...q, effort }));
  const setWorkedTimeFilter = (workedTime: TaskWorkedTimeFilter) => setTableQuery(q => ({ ...q, workedTime }));
  const setTableSort = (sort: TaskColumnSort[]) => setTableQuery(q => ({ ...q, sort }));
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
  const { workedSecondsByTask, workedTaskIds, loading: workedOnLoading, failed: workedOnFailed, retry: retryWorkedOn } = useTaskWorkedOn(workedOnFilter, nowMs, visibleTaskView === "table");
  const setTableColumns = useCallback(
    (columns: TaskTableColumn[]) => setTableQuery(q => ({ ...q, columns })),
    [setTableQuery],
  );
  const tableColumns = useTaskTableColumns(tableQuery.columns, setTableColumns);
  const [openHeaderMenu, setOpenHeaderMenu] = useState<string | null>(null);
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
    if (!visible || visibleTaskView !== "table") setOpenHeaderMenu(null);
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
    () => tasks.filter((task) => taskMatchesTableRowFilters(task, tableQuery, workedTaskIds, dateNowMs)),
    [tasks, tableQuery, workedTaskIds, dateNowMs],
  );
  const tableTasks = useMemo(
    () => tableTasksWithoutWorkedTime.filter((task) => taskMatchesWorkedTimeFilter(task, workedTimeFilter, nowMs, workedSecondsByTask?.get(task.id))),
    [tableTasksWithoutWorkedTime, workedTimeFilter, nowMs, workedSecondsByTask],
  );
  const emptyListCopy =
    workedOnLoading ? "Loading work history…"
      : workedOnFailed ? "Work history could not be loaded."
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
  const filterRules = [
    ...optionalRule("statuses", "Status", matchingTaskStatusPreset(tableStatuses) === "all" ? null : taskStatusFilterLabel(tableStatuses), () => setTableStatuses([...TASK_STATUSES])),
    ...optionalRule("scope", "Scope", selectedTaskScope, () => setSelectedTaskScope(null)),
    ...optionalRule("parent", "Parent", selectedParent === null ? null : selectedParent === "none" ? "No parent" : taskGraph.byId.get(selectedParent)?.title ?? "Parent", () => setSelectedParent(null)),
    ...optionalRule("created", "Created", taskDateFilterLabel(createdFilter, dateNowMs), () => setCreatedFilter(null)),
    ...optionalRule("updated", "Updated", taskDateFilterLabel(updatedFilter, dateNowMs), () => setUpdatedFilter(null)),
    ...optionalRule("closed", "Closed", taskDateFilterLabel(closedFilter, dateNowMs), () => setClosedFilter(null)),
    ...optionalRule("value", "Value", taskScoreFilterLabel(valueFilter), () => setValueFilter(null)),
    ...optionalRule("effort", "Effort", taskScoreFilterLabel(effortFilter), () => setEffortFilter(null)),
    ...optionalRule("workedTime", "Worked time", taskWorkedTimeFilterLabel(workedTimeFilter), () => setWorkedTimeFilter(null)),
  ];
  const savedHiddenColumnIds = new Set(
    taskTableViews.selected.query.columns.filter(column => column.hidden).map(column => column.id),
  );

  const newTaskButton = loaded && visibleTaskView !== "map" && (
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
  );

  const tableQueryPanel = (
    <div className="task-query">
      <div className="task-query__pickers">
        <TaskViewPicker views={taskTableViews} />
        <div className="task-query__result">
          <span className="task-filter-result" role="status">
            {workedOnLoading ? "Loading work history…" : workedOnFailed ? "Work history unavailable" : filtersEdited
              ? `${tableTasks.length} out of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
              : `${tableTasks.length} ${tableTasks.length === 1 ? "task" : "tasks"}`}
          </span>
          {workedOnFailed && <button type="button" className="task-filter-retry" onClick={retryWorkedOn}>Retry</button>}
        </div>
      </div>
      <TaskFilterRules rules={filterRules.map(rule => ({ ...rule, edited: changedFields.has(rule.field) }))}>
        <TaskWorkedOnFilter filter={workedOnFilter} onChange={setWorkedOnFilter}
          nowMs={dateNowMs} edited={changedFields.has("workedOn")}
          open={openHeaderMenu === "workedOn"}
          onOpenChange={open => setOpenHeaderMenu(open ? "workedOn" : null)} />
      </TaskFilterRules>
      <TaskSortRules rules={tableSort} savedRules={taskTableViews.selected.query.sort} onChange={setTableSort} />
      {tableColumns.hiddenColumns.length > 0 && <section className="task-query__group" aria-label="Hidden columns">
        <div className="task-query__head">
          <h3>{eyeOffIcon} Hidden</h3>
          {tableColumns.hiddenColumns.length > 1 && <button type="button" className="task-views__link" onClick={tableColumns.showAllColumns}>Show all</button>}
        </div>
        <ul className="task-query__chips">{tableColumns.hiddenColumns.map(column => <li key={column.id}>
          <button type="button" className={`task-query-chip${savedHiddenColumnIds.has(column.id) ? "" : " is-edited"}`}
            aria-label={`Show ${column.label} column`}
            title={savedHiddenColumnIds.has(column.id) ? `Show ${column.label} column` : `Show ${column.label} column (unsaved)`}
            onClick={() => tableColumns.showColumn(column.id)}>
            {column.label}<span aria-hidden="true">×</span>
          </button>
        </li>)}</ul>
      </section>}
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
    <section className="dash-section dash-section--tasks" aria-busy={!loaded || workedOnLoading}>
      {sidebar && createPortal(
        <>
          {newTaskButton}
          {loaded && visibleTaskView === "table" && tableQueryPanel}
        </>,
        sidebar,
      )}
      {(!sidebar || showTaskMap) && (
        <header className="dash-section__head task-header">
          <div className="task-header__actions">
            {!sidebar && newTaskButton}
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
                <TaskTable
                wrapRef={tableColumns.wrapRef}
                columns={tableColumns.visibleColumns}
                tasks={sortTasksByColumn(tableTasks, tableSort, taskGraph.byId, nowMs, workedSecondsByTask)}
                headerSort={tableSort[0]}
                renderHeader={(column) => (
                  <TaskTableHeaderMenu
                    column={column}
                    edited={taskTableColumnQueryEdited(column.id, taskTableViews.selected.query, tableQuery)}
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
                    createdFilter={createdFilter}
                    onCreatedFilterChange={setCreatedFilter}
                    updatedFilter={updatedFilter}
                    onUpdatedFilterChange={setUpdatedFilter}
                    closedFilter={closedFilter}
                    onClosedFilterChange={setClosedFilter}
                    valueFilter={valueFilter}
                    onValueFilterChange={setValueFilter}
                    effortFilter={effortFilter}
                    onEffortFilterChange={setEffortFilter}
                    workedTimeFilter={workedTimeFilter}
                    onWorkedTimeFilterChange={setWorkedTimeFilter}
                    workedTimeCandidates={tableTasksWithoutWorkedTime}
                    workHistoryStatus={workedOnLoading ? "Loading work history…" : workedOnFailed ? "Work history unavailable" : null}
                    workedSecondsByTask={workedSecondsByTask}
                    sort={tableSort}
                    onSortChange={setTableSort}
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
