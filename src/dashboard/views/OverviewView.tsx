import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createTask,
  reorderTasks,
  submitBrainDump,
} from "../../lib/commands";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
} from "../../lib/brainDumpDraft";
import {
  DayStats,
  PhaseTotals,
} from "../components/DayReflection";
import { useDashboardData } from "../context/DashboardDataContext";
import { CARD_CONTROLS, useListSort } from "../hooks/useListSort";
import { windowInsight } from "../lib/insights";
import {
  groupTasksByStatus,
  pinnedIdOrder,
  TASK_STATUS_LABEL,
} from "../lib/tasks";
import { TaskCard } from "../task/TaskCard";

const OVERVIEW_WINDOW_SECONDS = 60 * 60;
type OverviewTaskStatus = "active" | "up_next" | "backlog";

export function OverviewView() {
  const {
    tasks,
    taskStatusEvents,
    checkIns,
    phaseCheckIns,
    phases,
    mutate,
  } = useDashboardData();
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] =
    useState<OverviewTaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText } = brainDumpDraft;
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState(false);

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  // One sort per lane, keyed by its own drag kind so a card can only be
  // dropped among its own status — moving lanes stays the status pill's job.
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
    const { text } = trimBrainDumpDraft(brainDumpDraft);
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    const ok = await mutate(() => submitBrainDump(text, null));
    if (ok) setBrainDumpDraft({ title: "", text: "" });
    setBrainDumpSubmitting(false);
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
        <button type="submit" disabled={!quickAddTitle.trim()}>
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
      <section className={`overview-group overview-group--${status}`}>
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
          <textarea
            className="overview-dump-input"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={brainDumpText}
            onChange={(e) =>
              setBrainDumpDraft((draft) => ({
                ...draft,
                text: e.target.value,
              }))
            }
            onKeyDown={(e) => {
              if (
                isBrainDumpSubmitShortcut({
                  ...e,
                  isComposing: e.nativeEvent.isComposing,
                })
              ) {
                e.preventDefault();
                void submitOverviewDump();
              }
            }}
            aria-label="Brain dump"
          />
        </section>
      </section>
    </div>
  );
}
