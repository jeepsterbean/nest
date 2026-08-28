import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import { createPortal } from "react-dom";
import {
  createTask,
  reorderTasks,
  submitBrainDump,
} from "../../lib/commands";
import {
  isBrainDumpPeelShortcut,
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
  useRecentBrainDumpHistory,
} from "../../lib/brainDumpDraft";
import {
  createFloatingFromDraft,
  useFloatingBrainDumps,
  type FloatingBrainDump,
} from "../../lib/floatingBrainDumps";
import {
  DayStats,
  PhaseTotals,
} from "../components/DayReflection";
import { BrainDumpSurface } from "../components/BrainDumpSurface";
import { FloatingBrainDumpsBoard } from "../components/FloatingBrainDumpsBoard";
import { useDashboardData } from "../context/DashboardDataContext";
import { CARD_CONTROLS, useListSort } from "../hooks/useListSort";
import { windowInsight } from "../lib/insights";
import {
  groupTasksByStatus,
  pinnedIdOrder,
  TASK_STATUS_LABEL,
} from "../lib/tasks";
import { TaskCard } from "../task/TaskCard";
import { useComposerTagProps } from "../components/BrainDumpTags";

const OVERVIEW_WINDOW_SECONDS = 60 * 60;
type OverviewTaskStatus = "active" | "up_next" | "backlog";

export function OverviewView() {
  const {
    tasks,
    taskStatusEvents,
    checkIns,
    phaseCheckIns,
    phases,
    tags,
    loaded,
    mutate,
    setError,
  } = useDashboardData();
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] =
    useState<OverviewTaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const mainDumpRef = useRef<HTMLTextAreaElement | null>(null);
  const [portalRoot, setPortalRoot] = useState<Element | null>(null);
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText, tagIds: brainDumpTagIds } = brainDumpDraft;
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState(false);
  const brainDumpHistory = useRecentBrainDumpHistory(brainDumpText, setError);
  const composerTagProps = useComposerTagProps(
    tags,
    brainDumpTagIds,
    brainDumpHistory.viewingDump,
  );
  const {
    dumps: floatingDumps,
    addDump,
    updateDump,
    removeDump,
    bringToFront,
    reclampToBoard,
  } = useFloatingBrainDumps();

  const handleTagsChange = useCallback(
    (tagIds: number[]) =>
      setBrainDumpDraft((draft) => ({ ...draft, tagIds })),
    [setBrainDumpDraft],
  );

  const handleViewportResize = useCallback(
    (width: number, height: number) => {
      reclampToBoard(width, height);
    },
    [reclampToBoard],
  );

  useEffect(() => {
    setPortalRoot(document.querySelector(".dashboard"));
  }, []);

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const laneIds = (status: OverviewTaskStatus) =>
    tasksByStatus[status].map((task) => task.id);
  const onReorderLane = (ids: number[]) => {
    void mutate(() => reorderTasks(pinnedIdOrder(ids, tasks)));
  };
  const laneSorts = {
    active: useListSort(
      "overview-active",
      laneIds("active"),
      onReorderLane,
      CARD_CONTROLS,
    ),
    up_next: useListSort(
      "overview-up-next",
      laneIds("up_next"),
      onReorderLane,
      CARD_CONTROLS,
    ),
    backlog: useListSort(
      "overview-backlog",
      laneIds("backlog"),
      onReorderLane,
      CARD_CONTROLS,
    ),
  };
  const dayReflection = useMemo(() => {
    const to = Math.floor(Date.now() / 1000);
    return windowInsight(
      tasks,
      taskStatusEvents,
      checkIns,
      phaseCheckIns,
      phases,
      to - OVERVIEW_WINDOW_SECONDS,
      to,
    );
  }, [phaseCheckIns, phases, tasks, taskStatusEvents, checkIns]);

  const submitOverviewDump = async () => {
    const text = trimBrainDumpDraft(brainDumpDraft);
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() => submitBrainDump(text, null, brainDumpTagIds));
    if (ok) {
      setBrainDumpDraft({ text: "", tagIds: [] });
      await brainDumpHistory.refresh();
    }
    setBrainDumpSubmitting(false);
  };

  const peelToFloating = useCallback(() => {
    if (brainDumpHistory.viewingHistory) return;
    const width = window.innerWidth;
    const height = window.innerHeight;
    const next = createFloatingFromDraft(
      brainDumpDraft,
      floatingDumps,
      width,
      height,
    );
    if (!next) return;
    addDump(next);
    setBrainDumpDraft({ text: "", tagIds: [] });
  }, [
    addDump,
    brainDumpDraft,
    brainDumpHistory.viewingHistory,
    floatingDumps,
    setBrainDumpDraft,
  ]);

  const promoteFloatingDump = useCallback(
    (dump: FloatingBrainDump) => {
      const mainDraft = brainDumpDraft;
      const mainEmpty = !trimBrainDumpDraft(mainDraft);
      setBrainDumpDraft({ text: dump.text, tagIds: dump.tagIds });
      if (mainEmpty) removeDump(dump.id);
      else updateDump(dump.id, { text: mainDraft.text, tagIds: mainDraft.tagIds });
      mainDumpRef.current?.focus();
    },
    [brainDumpDraft, removeDump, setBrainDumpDraft, updateDump],
  );

  const submitFloatingDump = async (dump: FloatingBrainDump) => {
    const text = dump.text.trim();
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() => submitBrainDump(text, null, dump.tagIds));
    if (ok) {
      removeDump(dump.id);
      await brainDumpHistory.refresh();
    }
    setBrainDumpSubmitting(false);
  };

  const onMainDumpKeyDown = (
    event: React.KeyboardEvent<HTMLTextAreaElement>,
  ) => {
    if (brainDumpHistory.viewingHistory) return;
    if (
      isBrainDumpPeelShortcut({
        key: event.key,
        shiftKey: event.shiftKey,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      peelToFloating();
      return;
    }
    if (
      isBrainDumpSubmitShortcut({
        key: event.key,
        metaKey: event.metaKey,
        ctrlKey: event.ctrlKey,
        isComposing: event.nativeEvent.isComposing,
      })
    ) {
      event.preventDefault();
      void submitOverviewDump();
    }
  };

  const openQuickAdd = (status: OverviewTaskStatus) => {
    if (status === "backlog") setBacklogCollapsed(false);
    setQuickAddTitle("");
    setQuickAddStatus(status);
  };

  const submitQuickAdd = async (e: FormEvent, status: OverviewTaskStatus) => {
    e.preventDefault();
    const title = quickAddTitle.trim();
    if (!title) return;
    if (await mutate(() => createTask(title, "", status))) {
      setQuickAddTitle("");
      quickAddRef.current?.focus();
    }
  };

  const renderQuickAdd = (status: OverviewTaskStatus) =>
    quickAddStatus === status ? (
      <form
        className="overview-quick-add"
        onSubmit={(e) => submitQuickAdd(e, status)}
      >
        <input
          ref={quickAddRef}
          type="text"
          value={quickAddTitle}
          placeholder={`Add to ${TASK_STATUS_LABEL[status].toLowerCase()}…`}
          aria-label={`New ${TASK_STATUS_LABEL[status]} task`}
          onChange={(e) => setQuickAddTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Escape") setQuickAddStatus(null);
          }}
          onBlur={() => {
            if (!quickAddTitle.trim()) setQuickAddStatus(null);
          }}
        />
        <button type="submit" className="btn-accent" disabled={!quickAddTitle.trim()}>
          Add
        </button>
      </form>
    ) : null;

  const renderAddButton = (status: OverviewTaskStatus) => (
    <button
      type="button"
      className="overview-group__add"
      aria-label={`Add task to ${TASK_STATUS_LABEL[status].toLowerCase()}`}
      title={`Add ${TASK_STATUS_LABEL[status].toLowerCase()} task`}
      onClick={() => openQuickAdd(status)}
    >
      +
    </button>
  );

  const renderTaskList = (status: OverviewTaskStatus) => {
    const sort = laneSorts[status];
    return tasksByStatus[status].length === 0 ? (
      <div className="overview-task-group__empty">
        No {TASK_STATUS_LABEL[status].toLowerCase()} tasks
      </div>
    ) : (
      <ol className="overview-task-list">
        {tasksByStatus[status].map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            focusLayout
            draggable
            dragging={sort.draggingId === task.id}
            dropTarget={sort.overId === task.id}
            rowProps={sort.rowProps(task.id)}
          />
        ))}
      </ol>
    );
  };

  const renderOverviewGroup = (status: OverviewTaskStatus) => {
    const collapsible = status === "backlog";
    const collapsed = collapsible && backlogCollapsed;
    const headingInner = (
      <>
        <span
          className={`status-dot status-dot--${status}`}
          aria-hidden="true"
        />
        <span className="overview-group__name">
          {TASK_STATUS_LABEL[status]}
        </span>
        <span
          className={`overview-group__count${
            status === "active" ? " overview-group__count--accent" : ""
          }`}
        >
          {tasksByStatus[status].length}
        </span>
      </>
    );
    const body = (
      <div className="overview-group__reveal-body">
        {renderQuickAdd(status)}
        {renderTaskList(status)}
      </div>
    );
    return (
      <section className="overview-group">
        <header className="overview-group__head">
          <h3 className="overview-group__heading">
            {collapsible ? (
              <button
                type="button"
                className="overview-group__toggle"
                aria-expanded={!collapsed}
                onClick={() => setBacklogCollapsed((c) => !c)}
              >
                <span className="overview-group__chevron" aria-hidden="true">
                  ▾
                </span>
                {headingInner}
              </button>
            ) : (
              <span className="overview-group__static">{headingInner}</span>
            )}
          </h3>
          {renderAddButton(status)}
        </header>
        {collapsible ? (
          <div
            className={`overview-group__reveal${
              collapsed ? " is-collapsed" : ""
            }`}
          >
            <div className="overview-group__reveal-inner">{body}</div>
          </div>
        ) : (
          body
        )}
      </section>
    );
  };

  return (
    <div className="overview-stack">
      <section className="overview-day" aria-label="Last hour">
        <DayStats stats={dayReflection.stats} />
        <PhaseTotals sessions={dayReflection.sessions} phases={phases} />
      </section>

      <section className="overview-panels" aria-label="Overview">
        <section
          className="overview-panel overview-panel--tasks"
          aria-label="Task focus"
        >
          <div className="overview-panel__scroll">
            {renderOverviewGroup("active")}
            {renderOverviewGroup("up_next")}
            {renderOverviewGroup("backlog")}
          </div>
        </section>

        <section
          className="overview-panel overview-panel--dumps"
          aria-label="Brain dump"
        >
          {loaded && (
            <BrainDumpSurface
              className="brain-dump-surface--anchored"
              text={brainDumpHistory.text}
              tagIds={composerTagProps.selectedIds}
              tags={composerTagProps.tags}
              readOnly={brainDumpHistory.viewingHistory}
              tagsDisabled={brainDumpHistory.viewingHistory}
              textareaLabel={
                brainDumpHistory.viewingHistory
                  ? "Saved brain dump, read only"
                  : "Brain dump"
              }
              headerEnd={
                <div className="brain-dump-history-controls">
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="View previous brain dump"
                    title="Previous brain dump (Cmd/Ctrl+[)"
                    disabled={!brainDumpHistory.canViewPrevious}
                    onClick={brainDumpHistory.showPrevious}
                  >
                    <span aria-hidden="true">&#8249;</span>
                  </button>
                  <button
                    type="button"
                    tabIndex={-1}
                    aria-label="View next brain dump"
                    title="Next brain dump (Cmd/Ctrl+])"
                    disabled={!brainDumpHistory.canViewNext}
                    onClick={brainDumpHistory.showNext}
                  >
                    <span aria-hidden="true">&#8250;</span>
                  </button>
                </div>
              }
              onTextChange={(text) =>
                setBrainDumpDraft((draft) => ({ ...draft, text }))
              }
              onTagsChange={handleTagsChange}
              onKeyDown={onMainDumpKeyDown}
              textareaRef={mainDumpRef}
            />
          )}
        </section>
      </section>

      {loaded &&
        portalRoot &&
        createPortal(
          <FloatingBrainDumpsBoard
            dumps={floatingDumps}
            tags={tags}
            onTextChange={(id, text) => updateDump(id, { text })}
            onTagsChange={(id, tagIds) => updateDump(id, { tagIds })}
            onPositionChange={(id, x, y) => updateDump(id, { x, y })}
            onPromote={promoteFloatingDump}
            onRemove={removeDump}
            onSubmit={(dump) => void submitFloatingDump(dump)}
            onBringToFront={bringToFront}
            onViewportResize={handleViewportResize}
          />,
          portalRoot,
        )}
    </div>
  );
}
