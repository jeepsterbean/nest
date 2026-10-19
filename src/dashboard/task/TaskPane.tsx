import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
  type PointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { createTask } from "../../lib/commands";
import { plusIcon, gripIcon, xIcon } from "../components/icons";
import { TaskFilterRules } from "./TaskFilterRules";
import { TaskSortRules } from "./TaskSortRules";
import { TaskHiddenColumnRules } from "./TaskHiddenColumnRules";
import { ViewToggle } from "../components/ViewToggle";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTaskMenus } from "../context/TaskMenuContext";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useAppSettings } from "../hooks/useAppSettings";
import { useTaskTableColumns } from "../hooks/useTaskTableColumns";
import { useTaskWorkedOn } from "../hooks/useTaskWorkedOn";
import { useTaskTableViews } from "../hooks/useTaskTableViews";
import {
  canHideTaskTableColumn,
  TASK_VIEWS,
  visibleTaskViewFor,
  type TaskTableColumn,
  type TaskViewKey,
} from "../lib/taskTable";
import { TaskTableHeaderMenu, type TaskFilterContext } from "./TaskTableHeaderMenu";
import { taskMatchesTableRowFilters } from "../lib/taskTableFilter";
import { sortTasksByColumn, type TaskColumnSort } from "../lib/taskColumnSort";
import {
  changedTaskTableQueryFields,
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
} from "./TaskCreateCard";
import { TaskDetailPanel } from "./TaskDetailPanel";
import { TaskMap } from "./TaskMap";
import { TaskTable } from "./TaskTable";
import { nestTaskRows } from "../lib/taskNesting";
import { useTaskStatusChanged } from "../hooks/useTaskStatusChanged";
import { TaskViewPicker } from "./TaskViewPicker";
import { taskPaneEdgeForArrow, type TaskPaneEdge } from "../lib/taskPaneLayout";
import type { TaskTableColumnId } from "../lib/taskTable";

// A pane shares one editor slot between column headers and query rules.
type TaskQueryMenu = TaskTableColumnId | `filter:${TaskTableFilterField}` | `sort:${TaskTableColumnId}`;

export function TaskPane({
  paneId, viewId, loadVersion, onViewChange, sectionSidebar, visible, active, onActivate,
  onViewPointerDown, onPanePointerDown, onSplit, onClose, overlayHost, onModalChange,
}: {
  paneId: string;
  viewId: string;
  loadVersion: number;
  onViewChange: (id: string) => void;
  sectionSidebar: HTMLElement | null;
  visible: boolean;
  active: boolean;
  onActivate: () => void;
  onViewPointerDown: (event: PointerEvent<HTMLElement>, viewId: string) => void;
  onPanePointerDown: (event: PointerEvent<HTMLElement>) => void;
  onSplit: (viewId: string, edge: TaskPaneEdge) => void;
  onClose: (() => void) | undefined;
  overlayHost: HTMLElement | null;
  onModalChange: (paneId: string, open: boolean) => void;
}) {
  const {
    tasks,
    taskGraph,
    loaded,
    reload,
    setError,
  } = useDashboardData();
  const [taskView, setTaskView] = useState<TaskViewKey>("table");
  const showTaskMap = useAppSettings().showTaskMap;
  const visibleTaskView = visibleTaskViewFor(taskView, showTaskMap);
  const sidebar = active && visible ? sectionSidebar : null;
  const viewSwitch = showTaskMap && (
    <ViewToggle
      value={visibleTaskView}
      options={TASK_VIEWS}
      label="Tasks view"
      onChange={setTaskView}
    />
  );
  const taskTableViews = useTaskTableViews(viewId, onViewChange, loadVersion);
  useEffect(() => setTaskView("table"), [viewId, loadVersion]);
  const { query: tableQuery, setQuery: setTableQuery } = taskTableViews;
  const {
    statuses: tableStatuses,
    parent: selectedParent,
    workedOn: workedOnFilter,
    statusChanged: statusChangedFilter,
    workedTime: workedTimeFilter,
    sort: tableSort,
    nested: tableNested,
  } = tableQuery;
  const patchTableQuery = (patch: Partial<TaskTableQuery>) => setTableQuery(q => ({ ...q, ...patch }));
  const setSelectedParent = (parent: TaskParentFilter) => patchTableQuery({ parent });
  const setTableSort = (sort: TaskColumnSort[]) => patchTableQuery({ sort });
  // One table clock keeps displayed, filtered, and sorted live totals aligned.
  const tickWorkedTime = visible && visibleTaskView === "table" && (
    tasks.some(task => task.workingNow)
    || workedTimeFilter !== null
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
  const workHistory = useTaskWorkedOn(workedOnFilter, nowMs, visible && visibleTaskView === "table");
  const statusHistory = useTaskStatusChanged(statusChangedFilter, nowMs, visible && visibleTaskView === "table");
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
  const { statusMenu } = useTaskMenus();

  const selectTask = useCallback((id: number, origin?: HTMLElement) => {
    selectionOriginRef.current = origin ?? null;
    setSelectedTaskId(id);
  }, []);

  const closeDetail = useCallback(() => {
    setSelectedTaskId(null);
    const origin = selectionOriginRef.current;
    selectionOriginRef.current = null;
    requestAnimationFrame(() => { if (origin?.isConnected) origin.focus(); });
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

  // Tasks stays mounted while hidden, so leaving the Section resets each pane.
  useEffect(() => {
    if (!visible) {
      setTaskView("table");
      setSelectedTaskId(null);
    }
  }, [visible]);
  useEffect(() => {
    if (!visible || visibleTaskView !== "table") setOpenQueryMenu(null);
  }, [visible, visibleTaskView]);
  // Escape closes the detail panel, but only once open menus and in-place
  // editors have had their turn at the key. Every pane listens on window, so
  // only the active pane may react or one keypress would close them all.
  useEffect(() => {
    if (selectedTaskId === null || !visible || !active) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      if (statusMenu || creatingTask) return;
      if (e.defaultPrevented) return;
      const target = e.target as HTMLElement | null;
      if (target?.closest("input, textarea, select, [contenteditable='true']")) {
        return;
      }
      closeDetail();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [selectedTaskId, visible, active, statusMenu, creatingTask, closeDetail]);

  useEffect(() => {
    setCreatingTask(false);
  }, [visible, visibleTaskView]);

  const openTaskCreate = () => {
    // An untouched draft picks up the table's Status when the view shows only
    // one, so the new Task lands in the view it was added from.
    if (taskDraft === EMPTY_TASK_DRAFT && visibleTaskView === "table") {
      const status = tableStatuses.length === 1 ? tableStatuses[0]! : EMPTY_TASK_DRAFT.status;
      setTaskDraft({ ...EMPTY_TASK_DRAFT, status });
    }
    setCreatingTask(true);
  };

  const closeTaskCreate = useCallback(() => {
    setCreatingTask(false);
    requestAnimationFrame(() => newTaskButtonRef.current?.focus());
  }, []);

  const tableTasksWithoutWorkedTime = useMemo(
    () => tasks.filter((task) => taskMatchesTableRowFilters(task, tableQuery, historyMatches, dateNowMs)),
    [tasks, tableQuery, historyMatches, dateNowMs],
  );
  const tableTasks = useMemo(
    () => tableTasksWithoutWorkedTime.filter((task) => taskMatchesWorkedTimeFilter(task, workedTimeFilter, nowMs, workedSecondsByTask?.get(task.id))),
    [tableTasksWithoutWorkedTime, workedTimeFilter, nowMs, workedSecondsByTask],
  );
  const [collapsedTaskIds, setCollapsedTaskIds] = useState<ReadonlySet<number>>(() => new Set());
  const toggleTaskFold = useCallback((id: number) => {
    setCollapsedTaskIds((current) => {
      const next = new Set(current);
      if (!next.delete(id)) next.add(id);
      return next;
    });
  }, []);
  const sortedTableTasks = useMemo(
    () => sortTasksByColumn(tableTasks, tableSort),
    [tableTasks, tableSort],
  );
  const nestedRows = useMemo(
    () => (tableNested ? nestTaskRows(sortedTableTasks, collapsedTaskIds) : null),
    [tableNested, sortedTableTasks, collapsedTaskIds],
  );
  const emptyListCopy =
    historyLoading ? `Loading ${historyName.toLowerCase()}…`
      : historyFailed ? `${historyName} could not be loaded.`
      : tasks.length === 0
      ? "Nothing on the board yet — add the first task."
      : tableStatuses.length === 0
      ? "Choose at least one status."
      : "No tasks match these filters.";

  const onComposerSubmit = async (e: FormEvent) => {
    e.preventDefault();
    const title = composerTitle.trim();
    if (!title) return;
    try {
      const created = await createTask(title, "", "active");
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
    workedTimeCandidates: tableTasksWithoutWorkedTime,
    workedSecondsByTask,
    workHistoryStatus: historyStatus,
  };
  const savedHiddenColumnIds = new Set(
    taskTableViews.selected.query.columns.filter(column => column.hidden).map(column => column.id),
  );

  const tableQueryPanel = (
    <div className="task-query">
      <TaskFilterRules query={tableQuery} onQueryChange={patchTableQuery} changedFields={changedFields}
        context={filterContext} nowMs={dateNowMs}
        openField={openQueryMenu?.startsWith("filter:") ? openQueryMenu.slice("filter:".length) as TaskTableFilterField : null}
        onOpenFieldChange={field => setOpenQueryMenu(field ? `filter:${field}` : null)} />
      <TaskSortRules rules={tableSort} savedRules={taskTableViews.selected.query.sort} onChange={setTableSort}
        openColumn={openQueryMenu?.startsWith("sort:") ? openQueryMenu.slice("sort:".length) as TaskTableColumnId : null}
        onOpenColumnChange={column => setOpenQueryMenu(column ? `sort:${column}` : null)} />
      <TaskHiddenColumnRules columns={tableColumns.hiddenColumns} savedHiddenIds={savedHiddenColumnIds}
        onShow={tableColumns.showColumn} onShowAll={tableColumns.showAllColumns} />

    </div>
  );

  const sidebarControls = (
    <div className="task-pane-sidebar" inert={creatingTask || (selectedTaskId !== null && visibleTaskView !== "map")}>
      {viewSwitch}
      <TaskViewPicker views={taskTableViews} presentation="sidebar" onViewPointerDown={onViewPointerDown} onSplit={onSplit} />
      <div className="task-pane-sidebar__actions">
      <button
        type="button"
        className={`task-nest-toggle${tableNested ? " is-on" : ""}${changedFields.has("nested") ? " is-edited" : ""}`}
        aria-pressed={tableNested}
        title={`Nest ${taskTableViews.selected.name} by Parent`}
        onClick={() => patchTableQuery({ nested: !tableNested })}
      >
        Nest by Parent
      </button>
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

  useEffect(() => {
    onModalChange(paneId, overlayDetailOpen || creatingTask);
    return () => onModalChange(paneId, false);
  }, [paneId, overlayDetailOpen, creatingTask, onModalChange]);

  return (
    <section className={`dash-section dash-section--tasks task-pane${active ? " is-active" : ""}`}
      aria-label={`${taskTableViews.selected.name} task pane`} aria-busy={!loaded || historyLoading}
      onPointerDownCapture={onActivate} onFocusCapture={onActivate}>
      {sidebar && loaded && createPortal(sidebarControls, sidebar)}
      {!sectionSidebar && active && sidebarControls}
      <header className="task-pane__heading">
        <button type="button" className="task-pane__move" aria-label={`Move ${taskTableViews.selected.name} view`}
          title="Drag to move this pane; Alt + arrow key to split" onPointerDown={onPanePointerDown}
          onKeyDown={event => {
            const edge = taskPaneEdgeForArrow(event.key);
            if (event.altKey && edge) { event.preventDefault(); onSplit(taskTableViews.selected.id, edge); }
          }}>{gripIcon}</button>
        {visibleTaskView === "table" ? <TaskViewPicker views={taskTableViews} presentation="heading" /> : <strong className="task-pane__map-title">Map</strong>}
      <div className="task-table-bar__result">
        <span className="task-filter-result" role="status">
          {visibleTaskView === "map" ? `${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}` : historyStatus ?? (filtersEdited
            ? `${tableTasks.length} out of ${tasks.length} ${tasks.length === 1 ? "task" : "tasks"}`
            : `${tableTasks.length} ${tableTasks.length === 1 ? "task" : "tasks"}`)}
        </span>
        {historyFailed && <button type="button" className="task-filter-retry" onClick={retryHistory}>Retry</button>}
      </div>
        {onClose && <button type="button" className="task-pane__close" aria-label={`Close ${taskTableViews.selected.name} pane`}
          onClick={onClose}>{xIcon}</button>}
      </header>

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
                {tableQueryPanel}
                <TaskTable
                wrapRef={tableColumns.wrapRef}
                columns={tableColumns.visibleColumns}
                tasks={nestedRows?.tasks ?? sortedTableTasks}
                nesting={nestedRows ? { depthById: nestedRows.depthById, childCountById: nestedRows.childCountById, collapsedIds: collapsedTaskIds, onToggle: toggleTaskFold } : undefined}
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
          {selectedTask && overlayDetailOpen && overlayHost && createPortal(
            <div
              className="task-detail-overlay"
              onMouseDown={(e) => {
                // Status menus portal out of the panel; only a press
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
            </div>, overlayHost
          )}
        </div>
      )}
    </section>
  );
}
