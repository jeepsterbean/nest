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
import { TaskFilterRules } from "../task/TaskFilterRules";
import { TaskSortRules } from "../task/TaskSortRules";
import { ViewToggle } from "../components/ViewToggle";
import {
  HISTORY_WINDOW_DAYS,
  useDashboardData,
} from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import { useTaskTableViews } from "../hooks/useTaskTableViews";
import type { CorePaneControls } from "../lib/corePane";
import {
  boundedDayMs,
  stepSelectedDay,
} from "../lib/dateNavigation";
import { scopeMatches } from "../lib/scope";
import {
  canHideTaskTableColumn,
  HIDDEN_COLUMN_NAMES_LIMIT,
  hiddenColumnsLabel,
  readTaskView,
  sameHiddenTaskTableColumns,
  TASK_VIEWS,
  writeTaskView,
  type TaskTableColumn,
} from "../lib/taskTable";
import {
  TASK_STATUSES,
  matchingTaskStatusPreset,
  taskStatusFilterLabel,
} from "../lib/tasks";
import { TaskTableHeaderMenu } from "../task/TaskTableHeaderMenu";
import { taskDateFilterLabel, taskMatchesDateFilter, type TaskDateFilter } from "../lib/taskDateFilter";
import { taskScoreFilterLabel, taskMatchesScoreFilter, type TaskScoreFilter } from "../lib/taskScoreFilter";
import { sortTasksByColumn, type TaskColumnSort } from "../lib/taskColumnSort";
import { changedTaskTableQueryFields, taskTableColumnQueryEdited, taskTableFiltersEdited, type TaskParentFilter, type TaskTableQuery } from "../lib/taskTableViews";
import { taskMatchesWorkedTimeFilter, taskWorkedTimeFilterLabel, type TaskWorkedTimeFilter } from "../lib/taskWorkedTimeFilter";
import { historyStartSec, startOfDayMs } from "../lib/time";
import {
  EMPTY_TASK_DRAFT,
  TaskCreateCard,
  type TaskDraft,
} from "../task/TaskCreateCard";
import { TaskDay } from "../task/TaskDay";
import { TaskDetailPanel } from "../task/TaskDetailPanel";
import { TaskMap } from "../task/TaskMap";
import { TaskTable } from "../task/TaskTable";
import { TaskViewPicker } from "../task/TaskViewPicker";

type TableQueryPill = {
  field: keyof TaskTableQuery;
  name: string;
  value: string;
  remove: () => void;
};

const optionalPill = (field: TableQueryPill["field"], name: string, value: string | null, remove: () => void): TableQueryPill[] =>
  value === null ? [] : [{ field, name, value, remove }];

export function TasksView({ pane }: Pick<CorePaneControls, "pane">) {
  const {
    tasks,
    taskStatusEvents,
    taskWorkStretches,
    scopeTree,
    taskGraph,
    loaded,
    reload,
    setError,
  } = useDashboardData();
  const [taskView, setTaskView] = useState(readTaskView);
  const [dayAnchorMs, setDayAnchorMs] = useState<number | null>(null);
  const taskTableViews = useTaskTableViews();
  const { query: tableQuery, setQuery: setTableQuery } = taskTableViews;
  const {
    statuses: tableStatuses,
    scope: selectedTaskScope,
    parent: selectedParent,
    created: createdFilter,
    updated: updatedFilter,
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
  const setValueFilter = (value: TaskScoreFilter) => setTableQuery(q => ({ ...q, value }));
  const setEffortFilter = (effort: TaskScoreFilter) => setTableQuery(q => ({ ...q, effort }));
  const setWorkedTimeFilter = (workedTime: TaskWorkedTimeFilter) => setTableQuery(q => ({ ...q, workedTime }));
  const setTableSort = (sort: TaskColumnSort[]) => setTableQuery(q => ({ ...q, sort }));
  // One table clock keeps displayed, filtered, and sorted live totals aligned.
  const tickWorkedTime = taskView === "table" && (
    tasks.some(task => task.workingNow)
    || workedTimeFilter !== null
    || tableSort.some(rule => rule.column === "workedTime")
  );
  const dateNowMs = useCurrentTime();
  const earliestTaskHistorySec = historyStartSec(
    dateNowMs,
    HISTORY_WINDOW_DAYS,
  );
  const selectedTaskDayMs = boundedDayMs(
    dayAnchorMs ?? dateNowMs,
    dateNowMs,
    earliestTaskHistorySec,
  );
  const todayMs = startOfDayMs(dateNowMs / 1000);
  const earliestTaskDayMs = startOfDayMs(earliestTaskHistorySec);
  const [workedNowMs, setWorkedNowMs] = useState(() => Date.now());
  useEffect(() => {
    if (!tickWorkedTime) return;
    setWorkedNowMs(Date.now());
    const id = window.setInterval(() => setWorkedNowMs(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, [tickWorkedTime]);
  const nowMs = tickWorkedTime ? workedNowMs : dateNowMs;
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
    // An untouched draft picks up the table's Scope, and its Status when the
    // view shows only one, so the new Task lands in the view it was added from.
    if (taskDraft === EMPTY_TASK_DRAFT) {
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
    () => scopedTasks.filter((task) => tableStatuses.includes(task.status) && (selectedParent === null || (selectedParent === "none" ? task.parentTaskId === null : task.parentTaskId === selectedParent)) && taskMatchesDateFilter(task.createdAt, createdFilter, dateNowMs) && taskMatchesDateFilter(task.updatedAt, updatedFilter, dateNowMs) && taskMatchesScoreFilter(task.value, valueFilter) && taskMatchesScoreFilter(task.effort, effortFilter)),
    [scopedTasks, tableStatuses, selectedParent, createdFilter, updatedFilter, valueFilter, effortFilter, dateNowMs],
  );
  const tableTasks = useMemo(
    () => tableTasksWithoutWorkedTime.filter((task) => taskMatchesWorkedTimeFilter(task, workedTimeFilter, nowMs)),
    [tableTasksWithoutWorkedTime, workedTimeFilter, nowMs],
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
  const queryPills = [
    ...optionalPill("statuses", "Status", matchingTaskStatusPreset(tableStatuses) === "all" ? null : taskStatusFilterLabel(tableStatuses), () => setTableStatuses([...TASK_STATUSES])),
    ...optionalPill("scope", "Scope", selectedTaskScope, () => setSelectedTaskScope(null)),
    ...optionalPill("parent", "Parent", selectedParent === null ? null : selectedParent === "none" ? "No parent" : taskGraph.byId.get(selectedParent)?.title ?? "Parent", () => setSelectedParent(null)),
    ...optionalPill("created", "Created", taskDateFilterLabel(createdFilter, dateNowMs), () => setCreatedFilter(null)),
    ...optionalPill("updated", "Updated", taskDateFilterLabel(updatedFilter, dateNowMs), () => setUpdatedFilter(null)),
    ...optionalPill("value", "Value", taskScoreFilterLabel(valueFilter), () => setValueFilter(null)),
    ...optionalPill("effort", "Effort", taskScoreFilterLabel(effortFilter), () => setEffortFilter(null)),
    ...optionalPill("workedTime", "Worked time", taskWorkedTimeFilterLabel(workedTimeFilter), () => setWorkedTimeFilter(null)),
  ];
  const hasHiddenColumns = tableColumns.hiddenColumns.length > 0;
  const hiddenColumnsEdited = !sameHiddenTaskTableColumns(taskTableViews.selected.query.columns, tableQuery.columns);

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
  const overlayDetailOpen = selectedTask !== null && taskView !== "map";

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
          }}
        />
        {loaded && taskView === "table" && (
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
        )}
      </header>

      {!loaded ? (
        <div className="task-board__loading">Laying out the board…</div>
      ) : (
        <div
          className={`task-workspace${selectedTask && taskView === "map" ? " task-workspace--detail" : ""}${taskView === "map" ? " task-workspace--map" : ""}${overlayDetailOpen ? " task-workspace--overlay" : ""}`}
        >
          <div className="task-workspace__main" inert={overlayDetailOpen}>
            {taskView === "day" && (
              <TaskDay
                selectedDayMs={selectedTaskDayMs}
                nowMs={dateNowMs}
                canGoPrevious={selectedTaskDayMs > earliestTaskDayMs}
                canGoNext={selectedTaskDayMs < todayMs}
                tasks={tasks}
                taskGraph={taskGraph}
                statusEvents={taskStatusEvents}
                workStretches={taskWorkStretches}
                onPreviousDay={() =>
                  setDayAnchorMs(
                    stepSelectedDay(selectedTaskDayMs, -1, dateNowMs),
                  )
                }
                onNextDay={() =>
                  setDayAnchorMs(
                    stepSelectedDay(selectedTaskDayMs, 1, dateNowMs),
                  )
                }
                onToday={() => setDayAnchorMs(null)}
                onSelectTask={selectTask}
              />
            )}
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
                  <div className="task-table-toolbar__query">
                    <TaskViewPicker views={taskTableViews} />
                    {(queryPills.length > 0 || tableSort.length > 0 || hasHiddenColumns) && <div className="task-table-toolbar__pills" aria-label="Active filters, sorting and hidden columns">
                      <TaskFilterRules rules={queryPills.map(pill => ({ ...pill, edited: changedFields.has(pill.field) }))} />
                      {tableSort.length > 0 && <TaskSortRules rules={tableSort} savedRules={taskTableViews.selected.query.sort} onChange={setTableSort} edited={changedFields.has("sort")} />}
                      {hasHiddenColumns && <span className={`task-filter-pill task-filter-pill--columns${hiddenColumnsEdited ? " is-edited" : ""}`}>
                        <span className="task-filter-pill__icon" aria-hidden="true">{eyeOffIcon}</span>
                        <span className="task-filter-pill__value" aria-label={`Hidden columns: ${tableColumns.hiddenColumns.map(column => column.label).join(", ")}`}>
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
                    </div>}
                    <span className="task-filter-result" role="status">
                      {filtersEdited
                        ? `${tableTasks.length} out of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
                        : `${tableTasks.length} ${tableTasks.length === 1 ? "task" : "tasks"}`}
                    </span>
                  </div>
                </div>
                <TaskTable
                wrapRef={tableColumns.wrapRef}
                columns={tableColumns.visibleColumns}
                tasks={sortTasksByColumn(tableTasks, tableSort, taskGraph.byId, nowMs)}
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
                    valueFilter={valueFilter}
                    onValueFilterChange={setValueFilter}
                    effortFilter={effortFilter}
                    onEffortFilterChange={setEffortFilter}
                    workedTimeFilter={workedTimeFilter}
                    onWorkedTimeFilterChange={setWorkedTimeFilter}
                    workedTimeCandidates={tableTasksWithoutWorkedTime}
                    sort={tableSort}
                    onSortChange={setTableSort}
                    onHide={canHideTaskTableColumn(column.id) ? () => tableColumns.hideColumn(column.id) : undefined}
                  />
                )}
                taskGraph={taskGraph}
                nowMs={nowMs}
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
          {selectedTask && taskView === "map" && (
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
