import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import {
  createTask,
  renameTask,
  setTaskDescription,
  setTaskScope,
  setTaskScore,
  setTaskStatus,
  submitBrainDump,
  submitPhaseCheckIn,
} from "../lib/commands";
import type {
  BrainDump,
  Phase,
  RatingValue,
  Task,
  TaskStatus,
} from "../lib/types";
import { computeStreak, formatDate, formatDateTime } from "./lib/time";
import {
  normalizeTaskScope,
  scopeMatches,
  scopeSegments,
  type ScopeNode,
} from "./lib/scope";
import {
  groupTasksByStatus,
  RATING_VALUES,
  TASK_STATUS_LABEL,
  TASK_STATUSES,
} from "./lib/tasks";
import { buildTimeline } from "./lib/timeline";
import {
  checkCircleIcon,
  flagIcon,
  flameIcon,
  pencilIcon,
  plusIcon,
  trashIcon,
} from "./components/icons";
import {
  DashboardDataProvider,
  useDashboardData,
} from "./context/DashboardDataContext";
import { TaskMenuProvider, useTaskMenus } from "./context/TaskMenuContext";
import { MetricsView } from "./views/MetricsView";
import { PhasesView } from "./views/PhasesView";
import { JournalView } from "./views/JournalView";
import {
  DashboardHeader,
  type DashboardView,
} from "./components/DashboardHeader";
import { BrainDumpModal } from "./components/BrainDumpModal";
import { ErrorBanner } from "./components/ErrorBanner";
import "./Dashboard.css";

const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

function DashboardInner() {
  const {
    tasks,
    phases,
    checkIns,
    phaseCheckIns,
    brainDumps,
    allBrainDumps,
    latestPhase,
    scopeTree,
    loaded,
    reload,
    setError,
  } = useDashboardData();
  const {
    statusMenu,
    scopeMenu,
    newScopeName,
    setNewScopeName,
    openStatusMenu,
    openScopeMenu,
    closeStatusMenu,
    closeScopeMenu,
    setScopeMenuPath,
    beginAddingScope,
  } = useTaskMenus();
  const [view, setView] = useState<DashboardView>("overview");
  const [taskView, setTaskView] = useState<"kanban" | "table" | "matrix">(
    "kanban",
  );
  const [newTaskTitles, setNewTaskTitles] = useState<
    Record<TaskStatus, string>
  >({
    backlog: "",
    active: "",
    paused: "",
    completed: "",
    cancelled: "",
  });
  const [newTaskDescriptions, setNewTaskDescriptions] = useState<
    Record<TaskStatus, string>
  >({
    backlog: "",
    active: "",
    paused: "",
    completed: "",
    cancelled: "",
  });
  const [editingTaskId, setEditingTaskId] = useState<number | null>(null);
  const [editingTaskTitle, setEditingTaskTitle] = useState("");
  const [expandedTaskIds, setExpandedTaskIds] = useState<Set<number>>(
    new Set(),
  );
  const [editingDescriptionId, setEditingDescriptionId] = useState<
    number | null
  >(null);
  const [editingDescription, setEditingDescription] = useState("");
  const [selectedTaskScope, setSelectedTaskScope] = useState<string | null>(
    null,
  );
  const [collapsedScopePaths, setCollapsedScopePaths] = useState<Set<string>>(
    new Set(),
  );
  const newScopeInputRef = useRef<HTMLInputElement | null>(null);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<
    "active" | "backlog" | null
  >(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  const [quickBrainDumpTitle, setQuickBrainDumpTitle] = useState("");
  const [quickBrainDumpText, setQuickBrainDumpText] = useState("");
  const [quickBrainDumpSubmitting, setQuickBrainDumpSubmitting] =
    useState(false);
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    new Set(),
  );
  const [phasePickerOpen, setPhasePickerOpen] = useState(false);
  const [phaseChangingId, setPhaseChangingId] = useState<number | null>(null);

  const onCreateTask = async (e: React.FormEvent, status: TaskStatus) => {
    e.preventDefault();
    const title = newTaskTitles[status].trim();
    if (!title) return;
    const description = newTaskDescriptions[status].trim();
    try {
      await createTask(title, description, status);
      setNewTaskTitles((prev) => ({ ...prev, [status]: "" }));
      setNewTaskDescriptions((prev) => ({ ...prev, [status]: "" }));
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const openQuickAdd = (status: "active" | "backlog") => {
    if (status === "backlog") setBacklogCollapsed(false);
    setQuickAddTitle("");
    setQuickAddStatus(status);
  };

  const submitQuickAdd = async (
    e: React.FormEvent,
    status: "active" | "backlog",
  ) => {
    e.preventDefault();
    const title = quickAddTitle.trim();
    if (!title) return;
    try {
      await createTask(title, "", status);
      setQuickAddTitle("");
      quickAddRef.current?.focus();
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const startTaskEdit = (task: Task) => {
    setEditingTaskId(task.id);
    setEditingTaskTitle(task.title);
  };

  const commitTaskEdit = async () => {
    if (editingTaskId === null) return;
    const title = editingTaskTitle.trim();
    const id = editingTaskId;
    setEditingTaskId(null);
    if (!title) return;
    const current = tasks.find((t) => t.id === id);
    if (current && current.title === title) return;
    try {
      await renameTask(id, title);
      await reload();
    } catch (e) {
      setError(String(e));
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

  const startDescriptionEdit = (task: Task) => {
    setExpandedTaskIds((prev) => new Set(prev).add(task.id));
    setEditingDescriptionId(task.id);
    setEditingDescription(task.description);
  };

  const commitDescriptionEdit = async () => {
    if (editingDescriptionId === null) return;
    const description = editingDescription.trim();
    const id = editingDescriptionId;
    setEditingDescriptionId(null);
    const current = tasks.find((t) => t.id === id);
    if (current && current.description === description) return;
    try {
      await setTaskDescription(id, description);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onSetTaskStatus = async (task: Task, status: TaskStatus) => {
    if (task.status === status) return;
    try {
      await setTaskStatus(task.id, status);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onSetTaskScore = async (
    task: Task,
    value: RatingValue | null,
    effort: RatingValue | null,
  ) => {
    if (task.value === value && task.effort === effort) return;
    try {
      await setTaskScore(task.id, value, effort);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onSubmitQuickBrainDump = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = quickBrainDumpTitle.trim();
    const text = quickBrainDumpText.trim();
    if (!text || quickBrainDumpSubmitting) return;
    setQuickBrainDumpSubmitting(true);
    try {
      await submitBrainDump(text, title || null);
      setQuickBrainDumpTitle("");
      setQuickBrainDumpText("");
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setQuickBrainDumpSubmitting(false);
    }
  };

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  useEffect(() => {
    if (scopeMenu?.adding) newScopeInputRef.current?.focus();
  }, [scopeMenu?.adding]);

  const onSelectPhase = async (p: Phase) => {
    setPhasePickerOpen(false);
    if (latestPhase?.phaseId === p.id || phaseChangingId !== null) return;
    setPhaseChangingId(p.id);
    try {
      await submitPhaseCheckIn(p.id);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setPhaseChangingId(null);
    }
  };

  const phaseById = (id: number) => phases.find((p) => p.id === id);

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

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

  const visibleTasks = useMemo(
    () => tasks.filter((task) => scopeMatches(task.scope, selectedTaskScope)),
    [tasks, selectedTaskScope],
  );

  const tasksByStatus = useMemo(() => groupTasksByStatus(tasks), [tasks]);

  const visibleTasksByStatus = useMemo(
    () => groupTasksByStatus(visibleTasks),
    [visibleTasks],
  );

  const sortedPhases = useMemo(
    () =>
      [...phases].sort(
        (a, b) =>
          Number(a.inactiveSince !== null) - Number(b.inactiveSince !== null) ||
          a.createdAt - b.createdAt ||
          a.id - b.id,
      ),
    [phases],
  );

  const events = useMemo(
    () => buildTimeline(checkIns, phaseCheckIns, brainDumps),
    [checkIns, phaseCheckIns, brainDumps],
  );

  const overviewBrainDumps = useMemo(
    () =>
      [...allBrainDumps]
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .reverse(),
    [allBrainDumps],
  );

  const now = new Date();
  const weekAgo = Math.floor(now.getTime() / 1000) - SEVEN_DAYS_SECONDS;
  const weeklyCheckIns = checkIns.filter((c) => c.createdAt >= weekAgo).length;
  const weeklyDumps = brainDumps.filter((d) => d.createdAt >= weekAgo).length;
  const streak = computeStreak(events.map((ev) => ev.at));
  const currentPhaseName = latestPhase
    ? (phaseById(latestPhase.phaseId)?.name ??
      latestPhase.phaseLabel ??
      `Phase ${latestPhase.phaseId}`)
    : null;
  const activePhases = useMemo(
    () => sortedPhases.filter((p) => p.inactiveSince === null),
    [sortedPhases],
  );

  const brainDumpTitleFor = (dump: BrainDump) =>
    dump.title?.trim() || formatDateTime(dump.createdAt);

  const renderBrainDump = (
    dump: BrainDump,
    className: "overview-dump" | "event-dump",
  ) => {
    const expanded = expandedDumpIds.has(dump.id);
    const title = brainDumpTitleFor(dump);
    return (
      <div className={className}>
        <button
          type="button"
          className={`${className}__toggle`}
          aria-expanded={expanded}
          onClick={() => toggleDumpExpanded(dump.id)}
        >
          <span className={`${className}__chevron`} aria-hidden="true">
            {expanded ? "▾" : "▸"}
          </span>
          <span className={`${className}__title`}>{title}</span>
          {dump.title?.trim() ? (
            <time className={`${className}__time`}>
              {formatDateTime(dump.createdAt)}
            </time>
          ) : null}
        </button>
        {expanded && <p className={`${className}__text`}>{dump.text}</p>}
      </div>
    );
  };

  const renderTaskTitle = (task: Task) =>
    editingTaskId === task.id ? (
      <input
        type="text"
        className="rename-input"
        value={editingTaskTitle}
        autoFocus
        onChange={(e) => setEditingTaskTitle(e.target.value)}
        onBlur={commitTaskEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter") {
            e.preventDefault();
            commitTaskEdit();
          }
          if (e.key === "Escape") setEditingTaskId(null);
        }}
      />
    ) : (
      <button
        type="button"
        className="task-title"
        onClick={() => startTaskEdit(task)}
        title="Click to rename"
      >
        {task.title}
      </button>
    );

  const renderStatusSelect = (task: Task) => {
    const open = statusMenu?.taskId === task.id;
    return (
      <button
        type="button"
        className={`task-status-trigger task-status-trigger--${task.status}`}
        aria-haspopup="listbox"
        aria-expanded={open}
        aria-label={`Status for ${task.title}`}
        onClick={(e) => openStatusMenu(task, e.currentTarget)}
      >
        <span
          className={`status-dot status-dot--${task.status}`}
          aria-hidden="true"
        />
        <span className="task-status-trigger__label">
          {TASK_STATUS_LABEL[task.status]}
        </span>
        <span className="task-status-trigger__chevron" aria-hidden="true">
          ▾
        </span>
      </button>
    );
  };

  const renderStatusMenu = () => {
    if (!statusMenu) return null;
    const task = tasks.find((t) => t.id === statusMenu.taskId);
    if (!task) return null;
    return (
      <>
        <div
          className="task-status-backdrop"
          onClick={() => closeStatusMenu()}
        />
        <div
          className={`task-status-menu${
            statusMenu.up ? " task-status-menu--up" : ""
          }`}
          role="listbox"
          aria-label={`Status for ${task.title}`}
          style={{ left: statusMenu.left, top: statusMenu.top }}
        >
          {TASK_STATUSES.map((status) => {
            const selected = status === task.status;
            return (
              <button
                key={status}
                type="button"
                role="option"
                aria-selected={selected}
                autoFocus={selected}
                className={`task-status-menu__option${
                  selected ? " is-selected" : ""
                }`}
                onClick={() => {
                  onSetTaskStatus(task, status);
                  closeStatusMenu();
                }}
              >
                <span
                  className={`status-dot status-dot--${status}`}
                  aria-hidden="true"
                />
                <span
                  className={`task-status-menu__text task-status-menu__text--${status}`}
                >
                  {TASK_STATUS_LABEL[status]}
                </span>
                {selected && (
                  <span className="task-status-menu__check" aria-hidden="true">
                    ✓
                  </span>
                )}
              </button>
            );
          })}
        </div>
      </>
    );
  };

  const renderDotScale = (
    kind: "value" | "effort",
    label: string,
    task: Task,
    current: RatingValue | null,
  ) => {
    const commit = (next: RatingValue | null) =>
      kind === "value"
        ? onSetTaskScore(task, next, task.effort)
        : onSetTaskScore(task, task.value, next);
    return (
      <div className={`task-dots task-dots--${kind}`}>
        <span className="task-dots__label">{label}</span>
        <div
          className="task-dots__track"
          role="radiogroup"
          aria-label={`${label} for ${task.title}`}
          tabIndex={0}
          onKeyDown={(e) => {
            let next: RatingValue | null | undefined;
            if (e.key >= "1" && e.key <= "5") next = Number(e.key) as RatingValue;
            else if (e.key === "0" || e.key === "Backspace" || e.key === "Delete")
              next = null;
            else if (e.key === "ArrowRight" || e.key === "ArrowUp")
              next = Math.min(5, (current ?? 0) + 1) as RatingValue;
            else if (e.key === "ArrowLeft" || e.key === "ArrowDown") {
              const v = (current ?? 0) - 1;
              next = v <= 0 ? null : (v as RatingValue);
            } else return;
            e.preventDefault();
            commit(next);
          }}
        >
          {RATING_VALUES.map((n) => {
            const filled = current !== null && n <= current;
            return (
              <button
                key={n}
                type="button"
                role="radio"
                aria-checked={current === n}
                tabIndex={-1}
                className={`task-dot${filled ? " task-dot--filled" : ""}`}
                title={
                  current === n
                    ? `${label} ${n} — click to clear`
                    : `Set ${label.toLowerCase()} to ${n}`
                }
                onClick={() => commit(current === n ? null : n)}
              >
                <span className="task-dot__pip" aria-hidden="true" />
              </button>
            );
          })}
        </div>
      </div>
    );
  };

  const renderScoreControls = (task: Task) => (
    <div
      className="task-score"
      role="group"
      aria-label={`Priority scores for ${task.title}`}
    >
      {renderDotScale("value", "Value", task, task.value)}
      {renderDotScale("effort", "Effort", task, task.effort)}
    </div>
  );

  const toggleScopeCollapsed = (path: string) => {
    setCollapsedScopePaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const onSetTaskScope = async (task: Task, scope: string | null) => {
    if (task.scope === scope) {
      closeScopeMenu();
      return;
    }
    try {
      await setTaskScope(task.id, scope);
      closeScopeMenu();
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const submitNewScope = async (e: React.FormEvent, task: Task) => {
    e.preventDefault();
    const enteredScope = normalizeTaskScope(newScopeName);
    const scope =
      enteredScope && scopeMenu?.currentPath
        ? `${scopeMenu.currentPath} / ${enteredScope}`
        : enteredScope;
    if (!scope) return;
    await onSetTaskScope(task, scope);
    setNewScopeName("");
  };

  const renderTaskScope = (task: Task, display: "leaf" | "path" = "path") =>
    (
      <button
        type="button"
        className={
          task.scope ? "task-card__scope" : "task-card__scope task-card__scope--empty"
        }
        aria-haspopup="menu"
        aria-expanded={scopeMenu?.taskId === task.id}
        aria-label={task.scope ? `Scope: ${task.scope}` : "Set task scope"}
        onClick={(e) => openScopeMenu(task, e.currentTarget)}
        title={task.scope ? `Scope: ${task.scope}` : "Set scope"}
      >
        {task.scope ? (
          (display === "leaf"
            ? scopeSegments(task.scope).slice(-1)
            : scopeSegments(task.scope)
          ).map((segment, index, segments) => (
              <span
                key={`${segment}-${index}`}
                className={
                  index === segments.length - 1
                    ? "task-card__scope-segment task-card__scope-segment--leaf"
                    : "task-card__scope-segment"
                }
              >
                {segment}
              </span>
            ))
        ) : (
          <span className="task-card__scope-dot" aria-hidden="true" />
        )}
      </button>
    );

  const renderScopeMenu = () => {
    if (!scopeMenu) return null;
    const task = tasks.find((t) => t.id === scopeMenu.taskId);
    if (!task) return null;
    const currentNode = scopeMenu.currentPath
      ? scopeTree.byPath.get(scopeMenu.currentPath)
      : null;
    const visibleScopeNodes = currentNode ? currentNode.children : scopeTree.roots;
    const currentPathSegments = scopeMenu.currentPath
      ? scopeSegments(scopeMenu.currentPath)
      : [];
    return (
      <>
        <div
          className="task-scope-menu-backdrop"
          onClick={() => closeScopeMenu()}
        />
        <div
          className="task-scope-menu"
          role="menu"
          aria-label={`Scope for ${task.title}`}
          style={
            {
              left: scopeMenu.left,
              top: scopeMenu.top,
              "--task-scope-menu-max-height": `${scopeMenu.maxHeight}px`,
            } as CSSProperties
          }
        >
          <div className="task-scope-menu__head">
            <div
              className="task-scope-menu__path"
              aria-label="Current scope path"
            >
              <button
                type="button"
                className="task-scope-menu__crumb"
                onClick={() => setScopeMenuPath(null)}
              >
                Scopes
              </button>
              {currentPathSegments.map((segment, index) => {
                const path = currentPathSegments.slice(0, index + 1).join(" / ");
                return (
                  <span className="task-scope-menu__crumb-wrap" key={path}>
                    <span className="task-scope-menu__crumb-separator">/</span>
                    <button
                      type="button"
                      className="task-scope-menu__crumb"
                      onClick={() => setScopeMenuPath(path)}
                    >
                      {segment}
                    </button>
                  </span>
                );
              })}
            </div>
            <div className="task-scope-menu__actions">
              <button
                type="button"
                className="task-scope-menu__icon-btn"
                aria-label={
                  scopeMenu.currentPath
                    ? `Add scope under ${scopeMenu.currentPath}`
                    : "Add root scope"
                }
                title={
                  scopeMenu.currentPath
                    ? `Add scope under ${scopeMenu.currentPath}`
                    : "Add root scope"
                }
                onClick={() => beginAddingScope()}
              >
                {plusIcon}
              </button>
              {task.scope && (
                <button
                  type="button"
                  className="task-scope-menu__icon-btn task-scope-menu__icon-btn--danger"
                  aria-label="Remove scope"
                  title="Remove scope"
                  onClick={() => onSetTaskScope(task, null)}
                >
                  {trashIcon}
                </button>
              )}
            </div>
          </div>
          <div className="task-scope-menu__options">
            {visibleScopeNodes.length === 0 ? (
              <div className="task-scope-menu__empty">No child scopes</div>
            ) : (
              visibleScopeNodes.map((node) => {
                const selected = task.scope === node.path;
                const hasChildren = node.children.length > 0;
                return (
                  <div
                    key={node.path}
                    className={`task-scope-menu__option-row${
                      selected ? " is-selected" : ""
                    }`}
                  >
                    <button
                      type="button"
                      role="menuitemradio"
                      aria-checked={selected}
                      className="task-scope-menu__select"
                      onClick={() => onSetTaskScope(task, node.path)}
                    >
                      <span className="task-scope-menu__label">{node.label}</span>
                      {selected && (
                        <span className="task-scope-menu__check" aria-hidden="true">
                          ✓
                        </span>
                      )}
                    </button>
                    {hasChildren && (
                      <button
                        type="button"
                        className="task-scope-menu__drill"
                        aria-label={`Show scopes under ${node.path}`}
                        onClick={() => setScopeMenuPath(node.path)}
                      >
                        ›
                      </button>
                    )}
                  </div>
                );
              })
            )}
          </div>
          {scopeMenu.adding ? (
            <form
              className="task-scope-menu__new"
              onSubmit={(e) => submitNewScope(e, task)}
            >
              <input
                ref={newScopeInputRef}
                value={newScopeName}
                placeholder="New scope"
                aria-label="New task scope"
                onChange={(e) => setNewScopeName(e.target.value)}
              />
              <button type="submit" disabled={!normalizeTaskScope(newScopeName)}>
                Add
              </button>
            </form>
          ) : null}
        </div>
      </>
    );
  };

  const renderScopeNode = (node: ScopeNode) => {
    const selected = selectedTaskScope === node.path;
    const collapsed = collapsedScopePaths.has(node.path);
    const hasChildren = node.children.length > 0;
    return (
      <li className="task-scope-tree__item" key={node.path}>
        <div
          className="task-scope-tree__row"
          style={{ "--scope-depth": node.depth } as CSSProperties}
        >
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
            <span className="task-scope-tree__label">{node.label}</span>
          </button>
          <button
            type="button"
            className="task-scope-tree__count"
            onClick={() => hasChildren && toggleScopeCollapsed(node.path)}
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

  const renderTaskDescription = (task: Task) =>
    editingDescriptionId === task.id ? (
      <textarea
        className="task-card__description-input"
        value={editingDescription}
        autoFocus
        rows={3}
        placeholder="Add a description…"
        onChange={(e) => setEditingDescription(e.target.value)}
        onBlur={commitDescriptionEdit}
        onKeyDown={(e) => {
          if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) {
            e.preventDefault();
            commitDescriptionEdit();
          }
          if (e.key === "Escape") setEditingDescriptionId(null);
        }}
      />
    ) : (
      <button
        type="button"
        className={
          task.description
            ? "task-card__description"
            : "task-card__description task-card__description--empty"
        }
        onClick={() => startDescriptionEdit(task)}
        title="Click to edit description"
      >
        {task.description || "Add a description…"}
      </button>
    );

  const renderTaskCard = (
    task: Task,
    options: { showStatus?: boolean } = {},
  ) => {
    const { showStatus = true } = options;
    const expanded = expandedTaskIds.has(task.id);
    return (
      <li
        key={task.id}
        className={`task-card task-card--${task.status}${
          expanded ? " task-card--expanded" : ""
        }`}
      >
        <div className="task-card__top">
          <div className="task-card__identity">
            {!expanded && renderTaskScope(task, "leaf")}
            {renderTaskTitle(task)}
          </div>
          <button
            type="button"
            className="task-card__expand"
            aria-expanded={expanded}
            aria-label={expanded ? "Collapse task" : "Expand task"}
            title={expanded ? "Collapse" : "Expand"}
            onClick={() => toggleTaskExpanded(task.id)}
          >
            {expanded ? "▾" : "▸"}
          </button>
        </div>
        {expanded && (
          <div className="task-card__details">
            {renderTaskScope(task, "path")}
            {renderTaskDescription(task)}
          </div>
        )}
        <div className="task-card__controls">
          <div className="task-card__scores">{renderScoreControls(task)}</div>
          {showStatus && (
            <div className="task-card__meta">{renderStatusSelect(task)}</div>
          )}
        </div>
        {expanded && (
          <div className="task-card__footer">
            <time className="task-card__date">
              {formatDate(task.updatedAt)}
            </time>
          </div>
        )}
      </li>
    );
  };

  const renderTaskMatrix = () => {
    const open = visibleTasks.filter(
      (t) => t.status === "backlog" || t.status === "active",
    );
    const scored = open.filter((t) => t.value !== null && t.effort !== null);
    const unscored = open.filter((t) => t.value === null || t.effort === null);
    const ranked = [...scored].sort(
      (a, b) =>
        (b.value ?? 0) - (a.value ?? 0) ||
        (a.effort ?? 0) - (b.effort ?? 0) ||
        b.updatedAt - a.updatedAt,
    );
    return (
      <div className="task-matrix-layout">
        <div className="task-matrix">
          <span className="task-matrix__axis task-matrix__axis--value">
            Value
          </span>
          <div className="task-matrix__plot">
            <div className="task-matrix__quadrants" aria-hidden="true">
              <span className="task-matrix__quadrant">Quick wins</span>
              <span className="task-matrix__quadrant">Big bets</span>
              <span className="task-matrix__quadrant">Fill-ins</span>
              <span className="task-matrix__quadrant">Thankless</span>
            </div>
            {scored.length === 0 ? (
              <p className="task-matrix__empty">
                Score a task's value and effort to place it here.
              </p>
            ) : (
              scored.map((task) => {
                const x = 8 + (((task.effort ?? 3) - 1) / 4) * 84;
                const y = 8 + (((task.value ?? 3) - 1) / 4) * 84;
                return (
                  <span
                    key={task.id}
                    className="task-matrix__chip"
                    style={{ left: `${x}%`, bottom: `${y}%` }}
                    title={`${task.title} · value ${task.value}, effort ${task.effort}`}
                  >
                    {task.title}
                  </span>
                );
              })
            )}
          </div>
          <span className="task-matrix__axis task-matrix__axis--effort">
            Effort
          </span>
        </div>
        <div className="task-ranked">
          <h3 className="task-ranked__head">Do next</h3>
          {ranked.length === 0 ? (
            <p className="task-ranked__empty">Score some tasks to rank them.</p>
          ) : (
            <ol className="task-ranked__list">
              {ranked.map((task, i) => (
                <li key={task.id} className="task-ranked__item">
                  <span className="task-ranked__rank">{i + 1}</span>
                  <span className="task-ranked__title">{task.title}</span>
                  <span className="task-ranked__badges">
                    <span className="task-badge" title="Value">
                      V{task.value}
                    </span>
                    <span className="task-badge" title="Effort">
                      E{task.effort}
                    </span>
                  </span>
                </li>
              ))}
            </ol>
          )}
          {unscored.length > 0 && (
            <div className="task-ranked__unscored">
              <h4 className="task-ranked__subhead">Needs scoring</h4>
              <ol className="task-ranked__list">
                {unscored.map((task) => (
                  <li
                    key={task.id}
                    className="task-ranked__item task-ranked__item--unscored"
                  >
                    <span className="task-ranked__title">{task.title}</span>
                    {renderScoreControls(task)}
                  </li>
                ))}
              </ol>
            </div>
          )}
        </div>
      </div>
    );
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
        {tasksByStatus[status].map((task) => renderTaskCard(task))}
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
    <main className="dashboard">
      <div className="dashboard__inner">
        <DashboardHeader
          view={view}
          onSelectView={setView}
          brainDumpOpen={brainDumpOpen}
          onToggleBrainDump={() => setBrainDumpOpen((open) => !open)}
        />

        <BrainDumpModal
          open={brainDumpOpen}
          onClose={() => setBrainDumpOpen(false)}
        />

        <ErrorBanner />

        {view === "tasks" && (
        <section className="dash-section dash-section--tasks">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Tasks</h2>
              <span className="dash-section__sub">
                Move work through backlog, active, paused and done
              </span>
            </div>
            <div className="view-toggle" role="group" aria-label="Task view">
              <button
                type="button"
                className={
                  taskView === "kanban"
                    ? "view-toggle__btn view-toggle__btn--active"
                    : "view-toggle__btn"
                }
                onClick={() => setTaskView("kanban")}
              >
                Kanban
              </button>
              <button
                type="button"
                className={
                  taskView === "table"
                    ? "view-toggle__btn view-toggle__btn--active"
                    : "view-toggle__btn"
                }
                onClick={() => setTaskView("table")}
              >
                Table
              </button>
              <button
                type="button"
                className={
                  taskView === "matrix"
                    ? "view-toggle__btn view-toggle__btn--active"
                    : "view-toggle__btn"
                }
                onClick={() => setTaskView("matrix")}
              >
                Matrix
              </button>
            </div>
          </header>

          <div
            className={
              scopeTree.roots.length > 0
                ? "task-workspace"
                : "task-workspace task-workspace--no-scopes"
            }
          >
            {scopeTree.roots.length > 0 && (
              <aside className="task-scope-panel" aria-label="Task scopes">
                <div className="task-scope-panel__head">
                  <span>Scopes</span>
                  <span>{tasks.length}</span>
                </div>
                <button
                  type="button"
                  className={
                    selectedTaskScope === null
                      ? "task-scope-tree__btn task-scope-tree__btn--all task-scope-tree__btn--active"
                      : "task-scope-tree__btn task-scope-tree__btn--all"
                  }
                  onClick={() => setSelectedTaskScope(null)}
                >
                  <span className="task-scope-tree__label">All tasks</span>
                  <span className="task-scope-tree__count">{tasks.length}</span>
                </button>
                <ol className="task-scope-tree">
                  {scopeTree.roots.map(renderScopeNode)}
                </ol>
              </aside>
            )}

            <div className="task-workspace__main">
              {taskView === "kanban" && (
                <div className="task-board">
                  {TASK_STATUSES.map((status) => (
                    <section className="task-column" key={status}>
                      <header className="task-column__head">
                        <h3>{TASK_STATUS_LABEL[status]}</h3>
                        <span>{visibleTasksByStatus[status].length}</span>
                      </header>
                      <form
                        className="task-create"
                        onSubmit={(e) => onCreateTask(e, status)}
                      >
                        <div className="task-create__row">
                          <input
                            type="text"
                            placeholder={`Add to ${TASK_STATUS_LABEL[status].toLowerCase()}…`}
                            aria-label={`New ${TASK_STATUS_LABEL[status]} task`}
                            value={newTaskTitles[status]}
                            onChange={(e) =>
                              setNewTaskTitles((prev) => ({
                                ...prev,
                                [status]: e.target.value,
                              }))
                            }
                          />
                          <button
                            type="submit"
                            disabled={!newTaskTitles[status].trim()}
                          >
                            Add
                          </button>
                        </div>
                        <input
                          type="text"
                          className="task-create__description"
                          placeholder="Description (optional)…"
                          aria-label={`New ${TASK_STATUS_LABEL[status]} task description`}
                          value={newTaskDescriptions[status]}
                          onChange={(e) =>
                            setNewTaskDescriptions((prev) => ({
                              ...prev,
                              [status]: e.target.value,
                            }))
                          }
                        />
                      </form>
                      {visibleTasksByStatus[status].length === 0 ? (
                        <div className="task-column__empty">No tasks</div>
                      ) : (
                        <ol className="task-card-list">
                          {visibleTasksByStatus[status].map((task) =>
                            renderTaskCard(task, { showStatus: false }),
                          )}
                        </ol>
                      )}
                    </section>
                  ))}
                </div>
              )}
              {taskView === "table" && (
                <div className="task-table-wrap">
                  <table className="task-table">
                    <thead>
                      <tr>
                        <th>Title</th>
                        <th>Scope</th>
                        <th>Status</th>
                        <th>Priority</th>
                        <th>Created</th>
                        <th>Updated</th>
                      </tr>
                    </thead>
                    <tbody>
                      {visibleTasks.length === 0 ? (
                        <tr>
                          <td colSpan={6} className="task-table__empty">
                            {tasks.length === 0
                              ? "Add a task from the Kanban view to start the board."
                              : "No tasks match this scope."}
                          </td>
                        </tr>
                      ) : (
                        [...visibleTasks]
                          .sort(
                            (a, b) =>
                              TASK_STATUSES.indexOf(a.status) -
                                TASK_STATUSES.indexOf(b.status) ||
                              b.updatedAt - a.updatedAt ||
                              b.id - a.id,
                          )
                          .map((task) => (
                            <tr key={task.id}>
                              <td>{renderTaskTitle(task)}</td>
                              <td>{renderTaskScope(task)}</td>
                              <td>{renderStatusSelect(task)}</td>
                              <td>{renderScoreControls(task)}</td>
                              <td>{formatDate(task.createdAt)}</td>
                              <td>{formatDate(task.updatedAt)}</td>
                            </tr>
                          ))
                      )}
                    </tbody>
                  </table>
                </div>
              )}
              {taskView === "matrix" && renderTaskMatrix()}
            </div>
          </div>
        </section>
        )}

        {view === "metrics" && <MetricsView />}

        {view === "phases" && <PhasesView />}

        {view === "overview" && (
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
                <span>Full note history</span>
              </div>
            </header>
            <div className="overview-panel__scroll overview-panel__scroll--with-composer">
              {loaded && overviewBrainDumps.length === 0 ? (
                <div className="overview-dump-empty">
                  Nothing captured yet
                </div>
              ) : (
                <ol className="overview-dump-list">
                  {overviewBrainDumps.map((dump) => (
                    <li key={dump.id} className="overview-dump-item">
                      {renderBrainDump(dump, "overview-dump")}
                    </li>
                  ))}
                </ol>
              )}
            </div>
            <form
              className="overview-dump-composer"
              onSubmit={onSubmitQuickBrainDump}
            >
              <div className="overview-dump-composer__fields">
                <input
                  type="text"
                  value={quickBrainDumpTitle}
                  onChange={(e) => setQuickBrainDumpTitle(e.target.value)}
                  placeholder="Optional title"
                  aria-label="New brain dump title"
                />
                <textarea
                  value={quickBrainDumpText}
                  onChange={(e) => setQuickBrainDumpText(e.target.value)}
                  onKeyDown={(e) => {
                    if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                      e.preventDefault();
                      e.currentTarget.form?.requestSubmit();
                    }
                  }}
                  placeholder="Capture a loose thought..."
                  aria-label="New brain dump"
                  rows={3}
                />
              </div>
              <button
                type="submit"
                disabled={
                  !quickBrainDumpText.trim() || quickBrainDumpSubmitting
                }
              >
                {quickBrainDumpSubmitting ? "Saving..." : "Add"}
              </button>
            </form>
          </section>
        </section>
        </>
        )}

        {view === "journal" && <JournalView />}
      </div>
      {renderScopeMenu()}
      {renderStatusMenu()}
    </main>
  );
}

function Dashboard() {
  return (
    <DashboardDataProvider>
      <TaskMenuProvider>
        <DashboardInner />
      </TaskMenuProvider>
    </DashboardDataProvider>
  );
}

export default Dashboard;
