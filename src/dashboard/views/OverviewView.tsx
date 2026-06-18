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
  submitPhaseCheckIn,
} from "../../lib/commands";
import type { Phase } from "../../lib/types";
import {
  checkCircleIcon,
  clockIcon,
  eyeOffIcon,
  flagIcon,
  flameIcon,
  pencilIcon,
} from "../components/icons";
import { useDashboardData } from "../context/DashboardDataContext";
import { groupTasksByStatus, TASK_STATUS_LABEL } from "../lib/tasks";
import { computeStreak } from "../lib/time";
import { buildTimeline } from "../lib/timeline";
import { initialBrainDumpStart } from "../lib/brainDumps";
import { TaskCard } from "../task/TaskCard";
import { BrainDumpEntry } from "./BrainDumpEntry";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const OLDER_DUMP_BATCH_SIZE = 10;

export function OverviewView() {
  const {
    tasks,
    phases,
    checkIns,
    phaseCheckIns,
    brainDumps,
    allBrainDumps,
    latestPhase,
    loaded,
    mutate,
  } = useDashboardData();
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<
    "active" | "backlog" | null
  >(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const [phasePickerOpen, setPhasePickerOpen] = useState(false);
  const [phaseChangingId, setPhaseChangingId] = useState<number | null>(null);
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
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);
  const events = useMemo(
    () => buildTimeline(checkIns, phaseCheckIns, brainDumps),
    [checkIns, phaseCheckIns, brainDumps],
  );
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
  const activePhases = useMemo(
    () =>
      [...phases]
        .filter((p) => p.inactiveSince === null)
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id),
    [phases],
  );

  const now = new Date();
  const weekAgo = Math.floor(now.getTime() / 1000) - SEVEN_DAYS_SECONDS;
  const weeklyCheckIns = checkIns.filter((c) => c.createdAt >= weekAgo).length;
  const weeklyDumps = brainDumps.filter((d) => d.createdAt >= weekAgo).length;
  const streak = computeStreak(events.map((ev) => ev.at));
  const phaseById = (id: number) => phases.find((p) => p.id === id);
  const currentPhaseName = latestPhase
    ? (phaseById(latestPhase.phaseId)?.name ??
      latestPhase.phaseLabel ??
      `Phase ${latestPhase.phaseId}`)
    : null;

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
    if (brainDumpExpanded || visibleBrainDumpStart === null) return;
    if (suppressHistoryAutoScrollRef.current) {
      suppressHistoryAutoScrollRef.current = false;
      return;
    }
    requestAnimationFrame(() => {
      const history = brainDumpHistoryRef.current;
      if (history) history.scrollTop = history.scrollHeight;
    });
  }, [brainDumpExpanded, visibleBrainDumpStart]);

  const onSelectPhase = async (p: Phase) => {
    setPhasePickerOpen(false);
    if (latestPhase?.phaseId === p.id || phaseChangingId !== null) return;
    setPhaseChangingId(p.id);
    await mutate(() => submitPhaseCheckIn(p.id));
    setPhaseChangingId(null);
  };

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

  const openQuickAdd = (status: "active" | "backlog") => {
    if (status === "backlog") setBacklogCollapsed(false);
    setQuickAddTitle("");
    setQuickAddStatus(status);
  };

  const submitQuickAdd = async (e: FormEvent, status: "active" | "backlog") => {
    e.preventDefault();
    const title = quickAddTitle.trim();
    if (!title) return;
    if (await mutate(() => createTask(title, "", status))) {
      setQuickAddTitle("");
      quickAddRef.current?.focus();
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

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const renderQuickAdd = (status: "active" | "backlog") =>
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

  const renderAddButton = (status: "active" | "backlog") => (
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

  const renderTaskList = (status: "active" | "backlog") =>
    tasksByStatus[status].length === 0 ? (
      <div className="overview-task-group__empty">
        No {TASK_STATUS_LABEL[status].toLowerCase()} tasks
      </div>
    ) : (
      <ol className="overview-task-list">
        {tasksByStatus[status].map((task) => (
          <TaskCard
            key={task.id}
            task={task}
            expanded={expandedTaskIds.has(task.id)}
            onToggleExpand={() => toggleTaskExpanded(task.id)}
          />
        ))}
      </ol>
    );

  const renderOverviewGroup = (status: "active" | "backlog") => {
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
      <ul className="dash-stats">
        <li
          className="dash-stat dash-stat--phase"
          onBlur={(e) => {
            if (!e.currentTarget.contains(e.relatedTarget)) {
              setPhasePickerOpen(false);
            }
          }}
        >
          <button
            type="button"
            className="phase-summary"
            aria-haspopup="listbox"
            aria-expanded={phasePickerOpen}
            disabled={activePhases.length === 0 || phaseChangingId !== null}
            onClick={() => setPhasePickerOpen((open) => !open)}
          >
            {flagIcon}
            <span className="phase-summary__copy">
              <span>currently</span>
              <strong>
                {phaseChangingId !== null
                  ? "Changing..."
                  : currentPhaseName ?? "None yet"}
              </strong>
            </span>
            <span className="phase-summary__chevron" aria-hidden="true">
              ▾
            </span>
          </button>
          {phasePickerOpen && (
            <div className="phase-picker" role="listbox" aria-label="Phase">
              {activePhases.length === 0 ? (
                <div className="phase-picker__empty">No active phases</div>
              ) : (
                activePhases.map((p) => {
                  const selected = latestPhase?.phaseId === p.id;
                  return (
                    <button
                      key={p.id}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="phase-picker__option"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => onSelectPhase(p)}
                    >
                      <span className="phase-picker__dot" />
                      <span>{p.name}</span>
                      {selected && (
                        <span className="phase-picker__mark">Current</span>
                      )}
                    </button>
                  );
                })
              )}
            </div>
          )}
        </li>
        <li className="dash-stat dash-stat--checkins">
          {checkCircleIcon}
          <div>
            <strong>{weeklyCheckIns}</strong>
            <span>Check-ins · 7d</span>
          </div>
        </li>
        <li className="dash-stat dash-stat--dumps">
          {pencilIcon}
          <div>
            <strong>{weeklyDumps}</strong>
            <span>Brain dumps · 7d</span>
          </div>
        </li>
        <li className="dash-stat dash-stat--streak">
          {flameIcon}
          <div>
            <strong>
              {streak === 0 ? "—" : `${streak} day${streak === 1 ? "" : "s"}`}
            </strong>
            <span>Streak</span>
          </div>
        </li>
      </ul>
      <section className="overview-panels" aria-label="Overview">
        <section className="overview-panel overview-panel--tasks">
          <header className="overview-panel__head">
            <div>
              <h2>Task focus</h2>
              <span>Active and backlog work</span>
            </div>
          </header>
          <div className="overview-panel__scroll">
            {renderOverviewGroup("active")}
            {renderOverviewGroup("backlog")}
          </div>
        </section>

        <section className="overview-panel overview-panel--dumps">
          <header className="overview-panel__head">
            <div>
              <h2>Brain dumps</h2>
              <span>
                {brainDumpExpanded
                  ? "Capture a loose thought"
                  : brainDumpLogsHidden
                    ? "Logs hidden"
                    : "Recent note history"}
              </span>
            </div>
            <div className="overview-dump-actions">
              {!brainDumpExpanded && (
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
                  onClick={() => setBrainDumpLogsHidden((hidden) => !hidden)}
                >
                  <span aria-hidden="true">
                    {brainDumpLogsHidden ? clockIcon : eyeOffIcon}
                  </span>
                </button>
              )}
              <button
                type="button"
                className="overview-dump-mode"
                aria-label={
                  brainDumpExpanded
                    ? "Minimize composer and show brain dump history"
                    : "Open full brain dump composer"
                }
                title={
                  brainDumpExpanded ? "Show history" : "Open full composer"
                }
                onClick={
                  brainDumpExpanded
                    ? showBrainDumpHistory
                    : showBrainDumpComposer
                }
              >
                {brainDumpExpanded ? (
                  <span
                    className="overview-dump-mode__minimize"
                    aria-hidden="true"
                  >
                    −
                  </span>
                ) : (
                  <span
                    className="overview-dump-mode__pencil"
                    aria-hidden="true"
                  >
                    {pencilIcon}
                  </span>
                )}
              </button>
            </div>
          </header>
          {brainDumpExpanded ? (
            <form
              className="overview-dump-composer"
              onSubmit={onSubmitQuickBrainDump}
            >
              <input
                type="text"
                value={quickBrainDumpTitle}
                onChange={(e) => setQuickBrainDumpTitle(e.target.value)}
                placeholder="Optional title"
                aria-label="New brain dump title"
              />
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
