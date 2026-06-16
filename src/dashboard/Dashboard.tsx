import { useEffect, useMemo, useRef, useState, type CSSProperties } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createTask,
  createMetric,
  createPhase,
  deleteMetricCheckIn,
  latestPhaseCheckIn,
  listBrainDumps,
  listMetricCheckIns,
  listMetrics,
  listPhaseCheckIns,
  listPhases,
  listTasks,
  renameMetric,
  renamePhase,
  renameTask,
  setMetricActive,
  setPhaseActive,
  setTaskDescription,
  setTaskScope,
  setTaskScore,
  setTaskStatus,
  submitBrainDump,
  submitPhaseCheckIn,
} from "../lib/commands";
import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
  RatingValue,
  Task,
  TaskStatus,
} from "../lib/types";
import "./Dashboard.css";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;
const TASK_STATUSES: TaskStatus[] = [
  "backlog",
  "active",
  "completed",
  "paused",
  "cancelled",
];

const TASK_STATUS_LABEL: Record<TaskStatus, string> = {
  backlog: "Backlog",
  active: "Active",
  paused: "Paused",
  completed: "Completed",
  cancelled: "Cancelled",
};

const RATING_VALUES: RatingValue[] = [1, 2, 3, 4, 5];

type DashboardView = "overview" | "journal" | "tasks" | "metrics" | "phases";

const VIEWS: { key: DashboardView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "journal", label: "Journal" },
  { key: "tasks", label: "Tasks" },
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
];

type TimelineEvent =
  | { kind: "metrics"; at: number; checkIn: MetricCheckInWithRatings }
  | { kind: "phase"; at: number; checkIn: PhaseCheckIn }
  | { kind: "dump"; at: number; dump: BrainDump };

type DayGroup = { key: number; label: string; events: TimelineEvent[] };

type ScopeNode = {
  path: string;
  label: string;
  depth: number;
  count: number;
  children: ScopeNode[];
};

// A popup submit writes phase, then metrics, then the brain dump within the
// same second — rank them so the feed still reads newest-first.
const KIND_RANK: Record<TimelineEvent["kind"], number> = {
  dump: 0,
  metrics: 1,
  phase: 2,
};

const startOfDayMs = (tsSecs: number) => {
  const d = new Date(tsSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const previousDayMs = (dayMs: number) => {
  const d = new Date(dayMs);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const dayLabel = (tsSecs: number) => {
  const day = startOfDayMs(tsSecs);
  const today = startOfDayMs(Date.now() / 1000);
  if (day === today) return "Today";
  if (day === previousDayMs(today)) return "Yesterday";
  return new Date(tsSecs * 1000).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

// Days in a row with at least one entry. Today not having one yet doesn't
// break the streak — it just isn't counted.
const computeStreak = (eventTimes: number[]) => {
  const days = new Set(eventTimes.map(startOfDayMs));
  let cursor = startOfDayMs(Date.now() / 1000);
  if (!days.has(cursor)) cursor = previousDayMs(cursor);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayMs(cursor);
  }
  return streak;
};

const greetingForHour = (hour: number) => {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

const normalizeTaskScope = (scope: string) => {
  const normalized = scope
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" / ");
  return normalized || null;
};

const scopeSegments = (scope: string) =>
  scope
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

const scopeMatches = (taskScope: string | null, selectedScope: string | null) =>
  selectedScope === null ||
  taskScope === selectedScope ||
  taskScope?.startsWith(`${selectedScope} /`) === true;

const groupTasksByStatus = (taskList: Task[]) => {
  const grouped: Record<TaskStatus, Task[]> = {
    backlog: [],
    active: [],
    paused: [],
    completed: [],
    cancelled: [],
  };
  for (const task of taskList) grouped[task.status].push(task);
  for (const status of TASK_STATUSES) {
    grouped[status].sort(
      (a, b) =>
        b.updatedAt - a.updatedAt || b.createdAt - a.createdAt || b.id - a.id,
    );
  }
  return grouped;
};

const buildScopeTree = (taskList: Task[]) => {
  const roots: ScopeNode[] = [];
  const byPath = new Map<string, ScopeNode>();

  for (const task of taskList) {
    if (!task.scope) continue;
    const segments = scopeSegments(task.scope);
    let siblings = roots;
    let path = "";

    segments.forEach((label, index) => {
      path = path ? `${path} / ${label}` : label;
      let node = byPath.get(path);
      if (!node) {
        node = {
          path,
          label,
          depth: index,
          count: 0,
          children: [],
        };
        byPath.set(path, node);
        siblings.push(node);
      }
      node.count += 1;
      siblings = node.children;
    });
  }

  const sortNodes = (nodes: ScopeNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return { roots, byPath, paths: new Set(byPath.keys()) };
};

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const nestMark = (
  <svg {...iconProps}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4 11a8 8 0 0 0 16 0" />
    <path d="M6.5 13.5c1.8 1 3.6 1.5 5.5 1.5s3.7-.5 5.5-1.5" />
  </svg>
);

const flagIcon = (
  <svg {...iconProps}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" x2="4" y1="22" y2="15" />
  </svg>
);

const checkCircleIcon = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const pencilIcon = (
  <svg {...iconProps}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const plusIcon = (
  <svg {...iconProps}>
    <line x1="12" x2="12" y1="5" y2="19" />
    <line x1="5" x2="19" y1="12" y2="12" />
  </svg>
);

const trashIcon = (
  <svg {...iconProps}>
    <polyline points="3 6 5 6 21 6" />
    <path d="M19 6l-1 14H6L5 6" />
    <path d="M10 11v6" />
    <path d="M14 11v6" />
    <path d="M9 6V4h6v2" />
  </svg>
);

const flameIcon = (
  <svg {...iconProps}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="sparkline sparkline--empty">
        {values.length === 1 ? "First entry logged" : "No entries yet"}
      </div>
    );
  }
  const width = 100;
  const height = 32;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const yFor = (value: number) =>
    height - pad - ((value - 1) / 4) * (height - pad * 2);
  const points = values.map(
    (value, i) => [pad + i * stepX, yFor(value)] as const,
  );
  const line = points
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const area = `M ${points[0][0].toFixed(2)},${height} L ${line
    .split(" ")
    .join(" L ")} L ${lastX.toFixed(2)},${height} Z`;
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="sparkline__area" d={area} />
      <polyline
        className="sparkline__line"
        points={line}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="sparkline__dot"
        points={`${lastX},${lastY} ${lastX},${lastY}`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className="switch"
      title={checked ? "Active — click to pause" : "Paused — click to resume"}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  );
}

function Dashboard() {
  const [view, setView] = useState<DashboardView>("overview");
  const [tasks, setTasks] = useState<Task[]>([]);
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
  const [statusMenu, setStatusMenu] = useState<{
    taskId: number;
    left: number;
    top: number;
    up: boolean;
  } | null>(null);
  const [scopeMenu, setScopeMenu] = useState<{
    taskId: number;
    left: number;
    top: number;
    maxHeight: number;
    adding: boolean;
    currentPath: string | null;
  } | null>(null);
  const [newScopeName, setNewScopeName] = useState("");
  const newScopeInputRef = useRef<HTMLInputElement | null>(null);
  const [backlogCollapsed, setBacklogCollapsed] = useState(false);
  const [quickAddStatus, setQuickAddStatus] = useState<
    "active" | "backlog" | null
  >(null);
  const [quickAddTitle, setQuickAddTitle] = useState("");
  const quickAddRef = useRef<HTMLInputElement | null>(null);
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checkIns, setCheckIns] = useState<MetricCheckInWithRatings[]>([]);
  const [phaseCheckIns, setPhaseCheckIns] = useState<PhaseCheckIn[]>([]);
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [allBrainDumps, setAllBrainDumps] = useState<BrainDump[]>([]);
  const [latestPhase, setLatestPhase] = useState<PhaseCheckIn | null>(null);
  const [newMetricName, setNewMetricName] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [editingPhaseName, setEditingPhaseName] = useState("");
  const [brainDumpOpen, setBrainDumpOpen] = useState(false);
  const [brainDumpTitle, setBrainDumpTitle] = useState("");
  const [brainDumpText, setBrainDumpText] = useState("");
  const [brainDumpSubmitting, setBrainDumpSubmitting] = useState(false);
  const [quickBrainDumpTitle, setQuickBrainDumpTitle] = useState("");
  const [quickBrainDumpText, setQuickBrainDumpText] = useState("");
  const [quickBrainDumpSubmitting, setQuickBrainDumpSubmitting] =
    useState(false);
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(
    new Set(),
  );
  const [phasePickerOpen, setPhasePickerOpen] = useState(false);
  const [phaseChangingId, setPhaseChangingId] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);
  const brainDumpInputRef = useRef<HTMLTextAreaElement | null>(null);

  const reload = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - THIRTY_DAYS_SECONDS;
      const to = now + 1;
      const [t, m, p, ci, pci, bd, allBd, lp] = await Promise.all([
        listTasks(),
        listMetrics(true),
        listPhases(true),
        listMetricCheckIns(from, to),
        listPhaseCheckIns(from, to),
        listBrainDumps(from, to),
        listBrainDumps(0, to),
        latestPhaseCheckIn(),
      ]);
      setTasks(t);
      setMetrics(m);
      setPhases(p);
      setCheckIns(ci);
      setPhaseCheckIns(pci);
      setBrainDumps(bd);
      setAllBrainDumps(allBd);
      setLatestPhase(lp);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
    }
  };

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

  const onSubmitBrainDump = async (e: React.FormEvent) => {
    e.preventDefault();
    const title = brainDumpTitle.trim();
    const text = brainDumpText.trim();
    if (!text || brainDumpSubmitting) return;
    setBrainDumpSubmitting(true);
    try {
      await submitBrainDump(text, title || null);
      setBrainDumpTitle("");
      setBrainDumpText("");
      setBrainDumpOpen(false);
      await reload();
    } catch (e) {
      setError(String(e));
    } finally {
      setBrainDumpSubmitting(false);
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
    reload();
  }, []);

  useEffect(() => {
    if (brainDumpOpen) brainDumpInputRef.current?.focus();
  }, [brainDumpOpen]);

  useEffect(() => {
    if (quickAddStatus) quickAddRef.current?.focus();
  }, [quickAddStatus]);

  // Refresh when a check-in is submitted from the popup
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("check-in-submitted", () => {
      reload();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  // The status menu is fixed-positioned against its trigger, so any scroll,
  // resize, or Escape detaches it — close rather than let it drift.
  useEffect(() => {
    if (!statusMenu) return;
    const close = () => setStatusMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("scroll", close, true);
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("scroll", close, true);
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [statusMenu]);

  // The scope menu has its own scrollable option list, so scrolling should not
  // dismiss it. Outside click, resize, and Escape still close it.
  useEffect(() => {
    if (!scopeMenu) return;
    const close = () => setScopeMenu(null);
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") close();
    };
    window.addEventListener("resize", close);
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("resize", close);
      window.removeEventListener("keydown", onKey);
    };
  }, [scopeMenu]);

  useEffect(() => {
    if (scopeMenu?.adding) newScopeInputRef.current?.focus();
  }, [scopeMenu?.adding]);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMetricName.trim();
    if (!name) return;
    try {
      await createMetric(name);
      setNewMetricName("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPhaseName.trim();
    if (!name) return;
    try {
      await createPhase(name);
      setNewPhaseName("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const startEdit = (m: Metric) => {
    setEditingId(m.id);
    setEditingName(m.name);
  };

  const commitEdit = async () => {
    if (editingId === null) return;
    const name = editingName.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;
    const current = metrics.find((m) => m.id === id);
    if (current && current.name === name) return;
    try {
      await renameMetric(id, name);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const startPhaseEdit = (p: Phase) => {
    setEditingPhaseId(p.id);
    setEditingPhaseName(p.name);
  };

  const commitPhaseEdit = async () => {
    if (editingPhaseId === null) return;
    const name = editingPhaseName.trim();
    const id = editingPhaseId;
    setEditingPhaseId(null);
    if (!name) return;
    const current = phases.find((p) => p.id === id);
    if (current && current.name === name) return;
    try {
      await renamePhase(id, name);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onToggleActive = async (m: Metric) => {
    try {
      await setMetricActive(m.id, m.inactiveSince !== null);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onTogglePhaseActive = async (p: Phase) => {
    try {
      await setPhaseActive(p.id, p.inactiveSince !== null);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

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

  const onDeleteCheckIn = async (id: number) => {
    try {
      await deleteMetricCheckIn(id);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const metricById = (id: number) => metrics.find((m) => m.id === id);
  const phaseById = (id: number) => phases.find((p) => p.id === id);

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const scopeTree = useMemo(() => buildScopeTree(tasks), [tasks]);

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

  const sortedMetrics = useMemo(
    () =>
      [...metrics].sort(
        (a, b) =>
          Number(a.inactiveSince !== null) - Number(b.inactiveSince !== null) ||
          a.createdAt - b.createdAt ||
          a.id - b.id,
      ),
    [metrics],
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

  // Per-metric rating values in chronological order, for sparklines and stats.
  const seriesByMetric = useMemo(() => {
    const map = new Map<number, number[]>();
    const chronological = [...checkIns].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const ci of chronological) {
      for (const r of ci.ratings) {
        const values = map.get(r.metricId);
        if (values) values.push(r.value);
        else map.set(r.metricId, [r.value]);
      }
    }
    return map;
  }, [checkIns]);

  const events = useMemo<TimelineEvent[]>(() => {
    const all: TimelineEvent[] = [
      ...checkIns.map((ci) => ({
        kind: "metrics" as const,
        at: ci.createdAt,
        checkIn: ci,
      })),
      ...phaseCheckIns.map((ci) => ({
        kind: "phase" as const,
        at: ci.createdAt,
        checkIn: ci,
      })),
      ...brainDumps.map((d) => ({
        kind: "dump" as const,
        at: d.createdAt,
        dump: d,
      })),
    ];
    return all.sort(
      (a, b) => b.at - a.at || KIND_RANK[a.kind] - KIND_RANK[b.kind],
    );
  }, [checkIns, phaseCheckIns, brainDumps]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const ev of events) {
      const key = startOfDayMs(ev.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.events.push(ev);
      else groups.push({ key, label: dayLabel(ev.at), events: [ev] });
    }
    return groups;
  }, [events]);

  const overviewBrainDumps = useMemo(
    () =>
      [...allBrainDumps]
        .sort((a, b) => b.createdAt - a.createdAt || b.id - a.id)
        .reverse(),
    [allBrainDumps],
  );

  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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

  const formatDate = (ts: number | null) =>
    ts === null
      ? "—"
      : new Date(ts * 1000).toLocaleDateString(undefined, {
          month: "short",
          day: "numeric",
        });

  const formatDateTime = (ts: number) =>
    new Date(ts * 1000).toLocaleString(undefined, {
      year: "numeric",
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

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

  const openStatusMenu = (task: Task, anchor: HTMLElement) => {
    if (statusMenu?.taskId === task.id) {
      setStatusMenu(null);
      return;
    }
    setScopeMenu(null);
    const rect = anchor.getBoundingClientRect();
    // ~5 options at 36px plus padding; flip up when there isn't room below.
    const estHeight = 5 * 36 + 12;
    const menuWidth = 172;
    const up = window.innerHeight - rect.bottom < estHeight && rect.top > estHeight;
    setStatusMenu({
      taskId: task.id,
      left: Math.max(8, Math.min(rect.left, window.innerWidth - menuWidth - 8)),
      top: up ? rect.top - 6 : rect.bottom + 6,
      up,
    });
  };

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
          onClick={() => setStatusMenu(null)}
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
                  setStatusMenu(null);
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

  const openScopeMenu = (task: Task, anchor: HTMLElement) => {
    if (scopeMenu?.taskId === task.id) {
      setScopeMenu(null);
      return;
    }
    setStatusMenu(null);
    const rect = anchor.getBoundingClientRect();
    const initialPath =
      task.scope && scopeTree.byPath.has(task.scope) ? task.scope : null;
    const initialNode = initialPath ? scopeTree.byPath.get(initialPath) : null;
    const initialOptions = initialNode ? initialNode.children : scopeTree.roots;
    const visibleOptions = Math.min(Math.max(initialOptions.length, 1), 6);
    const viewportPad = 8;
    const estHeight = visibleOptions * 36 + 132;
    const menuWidth = 280;
    const maxHeight = Math.max(180, window.innerHeight - viewportPad * 2);
    const boundedHeight = Math.min(estHeight, maxHeight);
    const preferredBelowTop = rect.bottom + 6;
    const preferredAboveTop = rect.top - boundedHeight - 6;
    const top =
      window.innerHeight - preferredBelowTop >= boundedHeight
        ? preferredBelowTop
        : rect.top >= boundedHeight
          ? preferredAboveTop
          : Math.max(
              viewportPad,
              Math.min(
                preferredBelowTop,
                window.innerHeight - boundedHeight - viewportPad,
              ),
            );
    setNewScopeName("");
    setScopeMenu({
      taskId: task.id,
      left: Math.max(
        viewportPad,
        Math.min(rect.left, window.innerWidth - menuWidth - viewportPad),
      ),
      top,
      maxHeight: boundedHeight,
      adding: false,
      currentPath: initialPath,
    });
  };

  const onSetTaskScope = async (task: Task, scope: string | null) => {
    if (task.scope === scope) {
      setScopeMenu(null);
      return;
    }
    try {
      await setTaskScope(task.id, scope);
      setScopeMenu(null);
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
    const setScopeMenuPath = (currentPath: string | null) => {
      setNewScopeName("");
      setScopeMenu((prev) =>
        prev ? { ...prev, currentPath, adding: false } : prev,
      );
    };
    return (
      <>
        <div
          className="task-scope-menu-backdrop"
          onClick={() => setScopeMenu(null)}
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
                onClick={() =>
                  setScopeMenu((prev) =>
                    prev ? { ...prev, adding: true } : prev,
                  )
                }
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

  const renderEvent = (ev: TimelineEvent) => {
    switch (ev.kind) {
      case "metrics":
        return (
          <li key={`metrics-${ev.checkIn.id}`} className="event event--metrics">
            <div className="event__meta">
              <span className="event__type">Check-in</span>
              <time className="event__time">{formatTime(ev.at)}</time>
              <button
                type="button"
                className="event__delete"
                onClick={() => onDeleteCheckIn(ev.checkIn.id)}
                aria-label="Delete check-in"
                title="Delete check-in"
              >
                ×
              </button>
            </div>
            <ul className="event__ratings">
              {ev.checkIn.ratings.map((r) => (
                <li key={r.metricId} className="event__rating">
                  <span className="event__rating-name">
                    {metricById(r.metricId)?.name ?? `Metric ${r.metricId}`}
                  </span>
                  <span className={`rating-pill rating-pill--v${r.value}`}>
                    {r.value}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      case "phase": {
        const name =
          phaseById(ev.checkIn.phaseId)?.name ??
          ev.checkIn.phaseLabel ??
          `Phase ${ev.checkIn.phaseId}`;
        return (
          <li key={`phase-${ev.checkIn.id}`} className="event event--phase">
            <div className="event__meta">
              <span className="event__type">Phase</span>
              <time className="event__time">{formatTime(ev.at)}</time>
            </div>
            <p className="event__phase">
              Settled into <strong>{name}</strong>
            </p>
          </li>
        );
      }
      case "dump":
        return (
          <li key={`dump-${ev.dump.id}`} className="event event--dump">
            <div className="event__meta">
              <span className="event__type">Brain dump</span>
              <time className="event__time">{formatTime(ev.at)}</time>
            </div>
            {renderBrainDump(ev.dump, "event-dump")}
          </li>
        );
    }
  };

  return (
    <main className="dashboard">
      <div className="dashboard__inner">
        <header className="dash-header">
          <div className="dash-header__brand">
            <span className="dash-header__mark">{nestMark}</span>
            <span className="dash-header__name">Nest</span>
            <span className="dash-header__hint">
              <kbd>⌘⇧E</kbd>
              <span>check in from anywhere</span>
            </span>
          </div>
          <h1 className="dash-header__greeting">{greeting}.</h1>
          <p className="dash-header__date">{dateLine}</p>
          <div className="dash-header__nav-row">
            <nav className="dash-nav" aria-label="Views">
              {VIEWS.map((v) => (
                <button
                  key={v.key}
                  type="button"
                  className={
                    view === v.key
                      ? "dash-nav__btn dash-nav__btn--active"
                      : "dash-nav__btn"
                  }
                  aria-current={view === v.key ? "page" : undefined}
                  onClick={() => setView(v.key)}
                >
                  {v.label}
                </button>
              ))}
            </nav>
            <button
              type="button"
              className="brain-dump-trigger"
              aria-expanded={brainDumpOpen}
              aria-controls="brain-dump-composer"
              onClick={() => setBrainDumpOpen((open) => !open)}
            >
              <span className="brain-dump-trigger__icon">{pencilIcon}</span>
              Brain dump
            </button>
          </div>
        </header>

        {brainDumpOpen && (
          <div
            className="brain-dump-overlay"
            onMouseDown={(e) => {
              if (e.target === e.currentTarget) setBrainDumpOpen(false);
            }}
          >
            <form
              id="brain-dump-composer"
              className="brain-dump-composer"
              role="dialog"
              aria-modal="true"
              aria-labelledby="brain-dump-title"
              onSubmit={onSubmitBrainDump}
            >
              <div className="brain-dump-composer__head">
                <h2 id="brain-dump-title">Brain dump</h2>
                <button
                  type="button"
                  className="brain-dump-composer__close"
                  onClick={() => setBrainDumpOpen(false)}
                  aria-label="Close brain dump"
                >
                  ×
                </button>
              </div>
              <input
                type="text"
                className="brain-dump-composer__title"
                value={brainDumpTitle}
                onChange={(e) => setBrainDumpTitle(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBrainDumpOpen(false);
                }}
                placeholder="Optional title"
                aria-label="Brain dump title"
              />
              <textarea
                ref={brainDumpInputRef}
                value={brainDumpText}
                onChange={(e) => setBrainDumpText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Escape") setBrainDumpOpen(false);
                  if ((e.metaKey || e.ctrlKey) && e.key === "Enter") {
                    e.preventDefault();
                    e.currentTarget.form?.requestSubmit();
                  }
                }}
                placeholder="Drop the loose thoughts here..."
                aria-label="Brain dump text"
                rows={8}
              />
              <div className="brain-dump-composer__actions">
                <button
                  type="button"
                  className="brain-dump-composer__cancel"
                  onClick={() => setBrainDumpOpen(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="brain-dump-composer__submit"
                  disabled={!brainDumpText.trim() || brainDumpSubmitting}
                >
                  {brainDumpSubmitting ? "Saving..." : "Submit"}
                </button>
              </div>
            </form>
          </div>
        )}

        {error && (
          <div className="dashboard__error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

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

        {view === "metrics" && (
        <section className="dash-section dash-section--metrics">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Metrics</h2>
              <span className="dash-section__sub">
                How you've been feeling · last 30 days
              </span>
            </div>
            <form className="add-form" onSubmit={onCreate}>
              <input
                type="text"
                placeholder="New metric…"
                aria-label="New metric name"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
              />
              <button type="submit" disabled={!newMetricName.trim()}>
                Add
              </button>
            </form>
          </header>
          {loaded && metrics.length === 0 ? (
            <div className="dash-empty">
              <strong>No metrics yet</strong>
              <span>Add one above to start tracking how you feel.</span>
            </div>
          ) : (
            <ul className="metric-grid">
              {sortedMetrics.map((m) => {
                const active = m.inactiveSince === null;
                const values = seriesByMetric.get(m.id) ?? [];
                const latest = values.length
                  ? values[values.length - 1]
                  : null;
                const avg = values.length
                  ? values.reduce((sum, v) => sum + v, 0) / values.length
                  : null;
                return (
                  <li
                    key={m.id}
                    className={`metric-card${active ? "" : " metric-card--inactive"}`}
                  >
                    <div className="metric-card__top">
                      {editingId === m.id ? (
                        <input
                          type="text"
                          className="rename-input"
                          value={editingName}
                          autoFocus
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="metric-card__name"
                          onClick={() => startEdit(m)}
                          title="Click to rename"
                        >
                          {m.name}
                        </button>
                      )}
                      {!active && <span className="paused-tag">Paused</span>}
                      <Switch
                        checked={active}
                        onChange={() => onToggleActive(m)}
                        label={`${m.name} active`}
                      />
                    </div>
                    <Sparkline values={values} />
                    {values.length > 0 && (
                      <div className="metric-card__stats">
                        {latest !== null && (
                          <span
                            className={`rating-pill rating-pill--v${latest}`}
                          >
                            {latest}
                          </span>
                        )}
                        <span>avg {avg?.toFixed(1)}</span>
                        <span>
                          · {values.length}{" "}
                          {values.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}

        {view === "phases" && (
        <section className="dash-section dash-section--phases">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Phases</h2>
              <span className="dash-section__sub">
                Where your energy is going right now
              </span>
            </div>
            <form className="add-form" onSubmit={onCreatePhase}>
              <input
                type="text"
                placeholder="New phase…"
                aria-label="New phase name"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
              />
              <button type="submit" disabled={!newPhaseName.trim()}>
                Add
              </button>
            </form>
          </header>
          {loaded && phases.length === 0 ? (
            <div className="dash-empty">
              <strong>No phases yet</strong>
              <span>Add one above to name the season you're in.</span>
            </div>
          ) : (
            <ul className="phase-list">
              {sortedPhases.map((p) => {
                const active = p.inactiveSince === null;
                const isCurrent = active && latestPhase?.phaseId === p.id;
                const classes = [
                  "phase-card",
                  active ? "" : "phase-card--inactive",
                  isCurrent ? "phase-card--current" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={p.id} className={classes}>
                    <span className="phase-card__dot" aria-hidden="true" />
                    {editingPhaseId === p.id ? (
                      <input
                        type="text"
                        className="rename-input"
                        value={editingPhaseName}
                        autoFocus
                        onChange={(e) => setEditingPhaseName(e.target.value)}
                        onBlur={commitPhaseEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPhaseEdit();
                          }
                          if (e.key === "Escape") setEditingPhaseId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="phase-card__name"
                        onClick={() => startPhaseEdit(p)}
                        title="Click to rename"
                      >
                        {p.name}
                      </button>
                    )}
                    {isCurrent && <span className="phase-card__now">Now</span>}
                    <Switch
                      checked={active}
                      onChange={() => onTogglePhaseActive(p)}
                      label={`${p.name} active`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>
        )}

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

        {view === "journal" && (
        <section className="dash-section dash-section--journal">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Journal</h2>
              <span className="dash-section__sub">
                Check-ins, phase changes &amp; brain dumps · last 30 days
              </span>
            </div>
          </header>
          {loaded && dayGroups.length === 0 ? (
            <div className="dash-empty">
              <strong>Nothing here yet</strong>
              <span>
                Press <kbd>⌘⇧E</kbd> anywhere to log your first check-in.
              </span>
            </div>
          ) : (
            dayGroups.map((g) => (
              <div className="day-group" key={g.key}>
                <h3 className="day-group__label">{g.label}</h3>
                <ol className="timeline">{g.events.map(renderEvent)}</ol>
              </div>
            ))
          )}
        </section>
        )}
      </div>
      {renderScopeMenu()}
      {renderStatusMenu()}
    </main>
  );
}

export default Dashboard;
