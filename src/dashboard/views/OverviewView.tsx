import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from "react";
import {
  createTask,
  submitBrainDump,
} from "../../lib/commands";
import {
  clockIcon,
  eyeOffIcon,
  pencilIcon,
} from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { groupTasksByStatus, TASK_STATUS_LABEL } from "../lib/tasks";
import { initialBrainDumpStart } from "../lib/brainDumps";
import { TaskCard } from "../task/TaskCard";
import { BrainDumpEntry } from "./BrainDumpEntry";

const OLDER_DUMP_BATCH_SIZE = 10;
type OverviewTaskStatus = "active" | "up_next" | "backlog";

export function OverviewView() {
  const {
    tasks,
    allBrainDumps,
    loaded,
    mutate,
  } = useDashboardData();
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] =
    useState<OverviewTaskStatus | null>(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const [brainDumpExpanded, setBrainDumpExpanded] = useState(true);
  const [brainDumpLogsHidden, setBrainDumpLogsHidden] = useState(false);
  const [quickBrainDumpTitle, setQuickBrainDumpTitle] = useState("");
  const [quickBrainDumpText, setQuickBrainDumpText] = useState("");
  const [compactBrainDumpText, setCompactBrainDumpText] = useState("");
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState<
    "expanded" | "compact" | null
  >(null);
  const brainDumpTextRef = useRef<HTMLTextAreaElement | null>(null);
  const compactBrainDumpRef = useRef<HTMLInputElement | null>(null);
  const brainDumpHistoryRef = useRef<HTMLDivElement | null>(null);
  const loadingOlderDumpsRef = useRef(false);
  const suppressHistoryAutoScrollRef = useRef(false);
  const [visibleBrainDumpStart, setVisibleBrainDumpStart] = useState<
    number | null
  >(null);
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const overviewBrainDumps = useMemo(
    () =>
      [...allBrainDumps]
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id),
    [allBrainDumps],
  );
  const visibleOverviewBrainDumps = useMemo(
    () =>
      overviewBrainDumps.slice(
        visibleBrainDumpStart ?? overviewBrainDumps.length,
      ),
    [overviewBrainDumps, visibleBrainDumpStart],
  );
  const hasOlderBrainDumps =
    visibleBrainDumpStart !== null && visibleBrainDumpStart > 0;

  useEffect(() => {
    if (!loaded || visibleBrainDumpStart !== null) return;
    setVisibleBrainDumpStart(
      initialBrainDumpStart(
        overviewBrainDumps,
        Math.floor(Date.now() / 1000),
      ),
    );
  }, [loaded, overviewBrainDumps, visibleBrainDumpStart]);

  useEffect(() => {
    if (
      brainDumpExpanded ||
      brainDumpLogsHidden ||
      visibleBrainDumpStart === null
    ) {
      return;
    }
    if (suppressHistoryAutoScrollRef.current) {
      suppressHistoryAutoScrollRef.current = false;
      return;
    }
    requestAnimationFrame(() => {
      const history = brainDumpHistoryRef.current;
      if (history) history.scrollTop = history.scrollHeight;
    });
  }, [brainDumpExpanded, brainDumpLogsHidden, visibleBrainDumpStart]);

  const onSubmitQuickBrainDump = async (e: FormEvent) => {
    e.preventDefault();
    const title = quickBrainDumpTitle.trim();
    const text = quickBrainDumpText.trim();
    if (!text || brainDumpSubmitting !== null) return;
    setBrainDumpSubmitting("expanded");
    const ok = await mutate(() => submitBrainDump(text, title || null));
    if (ok) {
      setQuickBrainDumpTitle("");
      setQuickBrainDumpText("");
    }
    setBrainDumpSubmitting(null);
  };

  const onSubmitCompactBrainDump = async (e: FormEvent) => {
    e.preventDefault();
    const text = compactBrainDumpText.trim();
    if (!text || brainDumpSubmitting !== null) return;
    setBrainDumpSubmitting("compact");
    const ok = await mutate(() => submitBrainDump(text, null));
    if (ok) {
      setCompactBrainDumpText("");
      requestAnimationFrame(() => compactBrainDumpRef.current?.focus());
    }
    setBrainDumpSubmitting(null);
  };

  const showBrainDumpHistory = () => {
    setBrainDumpExpanded(false);
    requestAnimationFrame(() => compactBrainDumpRef.current?.focus());
  };

  const showBrainDumpComposer = () => {
    setBrainDumpExpanded(true);
    requestAnimationFrame(() => brainDumpTextRef.current?.focus());
  };

  const toggleBrainDumpLogs = () => {
    if (!brainDumpLogsHidden) {
      setBrainDumpLogsHidden(true);
      return;
    }
    loadingOlderDumpsRef.current = false;
    suppressHistoryAutoScrollRef.current = false;
    setVisibleBrainDumpStart(
      initialBrainDumpStart(
        overviewBrainDumps,
        Math.floor(Date.now() / 1000),
      ),
    );
    setBrainDumpLogsHidden(false);
  };

  const loadOlderBrainDumps = () => {
    if (
      visibleBrainDumpStart === null ||
      visibleBrainDumpStart === 0 ||
      loadingOlderDumpsRef.current
    ) {
      return;
    }
    const history = brainDumpHistoryRef.current;
    const previousHeight = history?.scrollHeight ?? 0;
    loadingOlderDumpsRef.current = true;
    suppressHistoryAutoScrollRef.current = true;
    setVisibleBrainDumpStart((current) =>
      current === null
        ? current
        : Math.max(0, current - OLDER_DUMP_BATCH_SIZE),
    );
    requestAnimationFrame(() => {
      if (history) {
        history.scrollTop += history.scrollHeight - previousHeight;
      }
      loadingOlderDumpsRef.current = false;
    });
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

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
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

  const renderTaskList = (status: OverviewTaskStatus) =>
    tasksByStatus[status].length === 0 ? (
      <div className="overview-task-group__empty">
        No {TASK_STATUS_LABEL[status].toLowerCase()} tasks
      </div>
    ) : (
      <ol className="overview-task-list">
        {tasksByStatus[status].map((task) => (
          <TaskCard key={task.id} task={task} focusLayout />
        ))}
      </ol>
    );

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
    <>
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
          aria-label="Brain dumps"
        >
          {brainDumpExpanded ? (
            <form
              className="overview-dump-composer"
              onSubmit={onSubmitQuickBrainDump}
            >
              <div className="overview-dump-composer__title-row">
                <input
                  type="text"
                  value={quickBrainDumpTitle}
                  onChange={(e) => setQuickBrainDumpTitle(e.target.value)}
                  placeholder="Optional title"
                  aria-label="New brain dump title"
                />
                <div className="overview-dump-actions">
                  <button
                    type="button"
                    className="overview-dump-mode"
                    aria-label="Minimize composer and show brain dump history"
                    title="Show history"
                    onClick={showBrainDumpHistory}
                  >
                    <span
                      className="overview-dump-mode__minimize"
                      aria-hidden="true"
                    >
                      −
                    </span>
                  </button>
                </div>
              </div>
              <textarea
                ref={brainDumpTextRef}
                value={quickBrainDumpText}
                onChange={(e) => setQuickBrainDumpText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                aria-label="New brain dump"
                rows={8}
              />
              <button
                type="submit"
                className="overview-dump-submit"
                disabled={
                  !quickBrainDumpText.trim() || brainDumpSubmitting !== null
                }
                aria-label={
                  brainDumpSubmitting === "expanded"
                    ? "Saving brain dump"
                    : "Save brain dump"
                }
                title="Save brain dump"
              >
                <span aria-hidden="true">
                  {brainDumpSubmitting === "expanded" ? "…" : "↑"}
                </span>
              </button>
            </form>
          ) : (
            <>
              <div className="overview-dump-toolbar">
                <div className="overview-dump-actions">
                  <button
                    type="button"
                    className="overview-dump-visibility"
                    aria-pressed={brainDumpLogsHidden}
                    aria-label={
                      brainDumpLogsHidden
                        ? "Show recent brain dumps"
                        : "Hide all brain dump logs"
                    }
                    title={
                      brainDumpLogsHidden ? "Show recent logs" : "Hide all logs"
                    }
                    onClick={toggleBrainDumpLogs}
                  >
                    <span aria-hidden="true">
                      {brainDumpLogsHidden ? clockIcon : eyeOffIcon}
                    </span>
                  </button>
                  <button
                    type="button"
                    className="overview-dump-mode"
                    aria-label="Open full brain dump composer"
                    title="Open full composer"
                    onClick={showBrainDumpComposer}
                  >
                    <span
                      className="overview-dump-mode__pencil"
                      aria-hidden="true"
                    >
                      {pencilIcon}
                    </span>
                  </button>
                </div>
              </div>
              <div
                ref={brainDumpHistoryRef}
                className={`overview-panel__scroll overview-dump-history${
                  brainDumpLogsHidden ? " is-hidden" : ""
                }`}
                aria-hidden={brainDumpLogsHidden}
                onWheel={(e) => {
                  if (brainDumpLogsHidden) return;
                  if (e.deltaY < 0 && e.currentTarget.scrollTop <= 24) {
                    loadOlderBrainDumps();
                  }
                }}
                onScroll={(e) => {
                  if (brainDumpLogsHidden) return;
                  if (
                    e.currentTarget.scrollHeight >
                      e.currentTarget.clientHeight &&
                    e.currentTarget.scrollTop <= 8
                  ) {
                    loadOlderBrainDumps();
                  }
                }}
              >
                {hasOlderBrainDumps && (
                  <div className="overview-dump-history__older">
                    Scroll up for older entries
                  </div>
                )}
                {loaded && visibleOverviewBrainDumps.length === 0 ? (
                  <div className="overview-dump-empty">
                    No brain dumps in the last hour
                  </div>
                ) : (
                  <ol className="overview-dump-list">
                    {visibleOverviewBrainDumps.map((dump) => (
                      <li key={dump.id} className="overview-dump-item">
                        <BrainDumpEntry
                          dump={dump}
                          className="overview-dump"
                          expanded={expandedDumpIds.has(dump.id)}
                          onToggle={() => toggleDumpExpanded(dump.id)}
                        />
                      </li>
                    ))}
                  </ol>
                )}
              </div>
              <form
                className="overview-dump-compact"
                onSubmit={onSubmitCompactBrainDump}
              >
                <input
                  ref={compactBrainDumpRef}
                  type="text"
                  value={compactBrainDumpText}
                  onChange={(e) => setCompactBrainDumpText(e.target.value)}
                  aria-label="Quick brain dump"
                />
                <button
                  type="submit"
                  disabled={
                    !compactBrainDumpText.trim() || brainDumpSubmitting !== null
                  }
                  aria-label={
                    brainDumpSubmitting === "compact"
                      ? "Saving quick brain dump"
                      : "Save quick brain dump"
                  }
                  title="Save brain dump"
                >
                  <span aria-hidden="true">
                    {brainDumpSubmitting === "compact" ? "…" : "↑"}
                  </span>
                </button>
              </form>
            </>
          )}
        </section>
      </section>
    </>
  );
}
