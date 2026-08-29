import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { emit } from "@tauri-apps/api/event";
import {
  createTask,
  getTimerState,
  listMetrics,
  listPulses,
  listTaskWorkStretches,
  listTasks,
  listTags,
  reorderTasks,
  startTimer,
  setTaskStatus,
  setTaskWorking,
  showDashboard,
  stopAllWorkingNow,
  submitBrainDump,
  submitMetricCheckIn,
} from "../lib/commands";
import { subscribeTauriEvent } from "../lib/tauriListen";
import type {
  TimerState,
  Metric,
  MetricRatingInput,
  Pulse,
  RatingValue,
  Task,
  TaskWorkStretch,
  Tag,
} from "../lib/types";
import {
  formatTimerCountdown,
  timerRemainingSeconds,
  TIMER_INTERVALS,
  isTimerDue,
} from "../dashboard/lib/time";
import { workedSecondsToday } from "../dashboard/lib/workTimeline";
import {
  groupTasksByStatus,
  pinnedIdOrder,
  RATING_VALUES,
  recentlyClosedTasks,
} from "../dashboard/lib/tasks";
import { CARD_CONTROLS, useListSort } from "../dashboard/hooks/useListSort";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
  useRecentBrainDumpHistory,
} from "../lib/brainDumpDraft";
import { readHiddenPulseIds } from "../lib/pulseVisibility";
import { readMetricDueHeld, writeMetricDueHeld } from "../lib/metricDue";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import { NestIcon } from "../dashboard/components/PulseIcon";
import {
  BrainDumpTags,
  useComposerTagProps,
} from "../dashboard/components/BrainDumpTags";
import { BrainDumpHistoryControls } from "../dashboard/components/BrainDumpHistoryControls";
import { resolveMetricColorFromList } from "../lib/metricColors";
import { startPopupWindowDrag } from "./windowDrag";
import "./PopupContent.css";

// Drop targets for a lane with no tasks in it. Negative so they can never
// collide with a task id.
const EMPTY_ACTIVE_ROW = -1;
const EMPTY_UP_NEXT_ROW = -2;

type LoadState = {
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  workStretches: TaskWorkStretch[];
  timer: TimerState;
  tags: Tag[];
};

const loadTodayStretches = (nowMs: number = Date.now()) => {
  const now = Math.floor(nowMs / 1000);
  const from = Math.floor(
    new Date(nowMs).setHours(0, 0, 0, 0) / 1000,
  );
  return listTaskWorkStretches(from, now + 1);
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" fill="currentColor" stroke="none" />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M16.2 6.1 8.4 14 4 9.6"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2.2"
      />
    </svg>
  );
}

function QueueIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M6 6.5 10 10l4-3.5M6 11.5 10 15l4-3.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function RestoreIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M7.5 5.5H3.5v4M4 9.2A6.2 6.2 0 1 0 5.6 6.1"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function CancelledMark() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M6 6l8 8M14 6l-8 8"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeWidth="2"
      />
    </svg>
  );
}

function ExpandIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M8 3H3v5m9-5h5v5M8 17H3v-5m9 5h5v-5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

/** Empty timer chrome may move the window; controls inside it must not. */
export function isPopupWindowDragTarget(target: EventTarget | null): boolean {
  if (
    target == null ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }
  return !(target as Element).closest(
    "button, [role='listbox'], a, input, textarea",
  );
}

/** Close an open overlay when the pointer lands outside its keep-alive root. */
export function shouldDismissOnPointerDown(
  open: boolean,
  target: EventTarget | null,
  keepInsideSelector: string,
): boolean {
  if (
    !open ||
    target == null ||
    typeof (target as { closest?: unknown }).closest !== "function"
  ) {
    return false;
  }
  return !(target as Element).closest(keepInsideSelector);
}

/** Ignore re-render blurs (relatedTarget is null); close when focus actually left. */
export function shouldCloseOverlayOnFocusLeave(
  currentTarget: EventTarget | null,
  relatedTarget: EventTarget | null,
): boolean {
  if (relatedTarget == null) return false;
  if (
    currentTarget == null ||
    typeof (currentTarget as { contains?: unknown }).contains !== "function"
  ) {
    return true;
  }
  return !(currentTarget as Node).contains(relatedTarget as Node);
}

export function PopupTopPanel({
  timerDue,
  countdown,
  remainingRatio,
  timerPickerOpen,
  schedulingTimer,
  selectedInterval,
  timerButtonRef,
  dashboardButtonRef,
  onTimerPickerOpenChange,
  onSelectInterval,
  onTimerPrevious,
  onDashboardNext,
  onOpenDashboard,
}: {
  timerDue: boolean;
  countdown: string;
  /** Remaining share of the current interval, 0–1. Hidden at 0. */
  remainingRatio: number;
  timerPickerOpen: boolean;
  schedulingTimer: boolean;
  selectedInterval: number;
  timerButtonRef: RefObject<HTMLButtonElement | null>;
  dashboardButtonRef: RefObject<HTMLButtonElement | null>;
  onTimerPickerOpenChange: (open: boolean) => void;
  onSelectInterval: (minutes: number) => void;
  onTimerPrevious: () => void;
  onDashboardNext: () => void;
  onOpenDashboard: () => void;
}) {
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);
  const displayedInterval = pendingInterval ?? selectedInterval;

  useEffect(() => {
    if (!timerPickerOpen) setPendingInterval(null);
  }, [timerPickerOpen]);

  const moveTimerSelection = (direction: -1 | 1) => {
    setPendingInterval(adjacentTimerInterval(displayedInterval, direction));
    onTimerPickerOpenChange(true);
  };

  return (
    <header
      className="combined-timer"
      onPointerDown={(event) => {
        if (event.button !== 0 || !isPopupWindowDragTarget(event.target)) {
          return;
        }
        startPopupWindowDrag();
      }}
    >
      <div
        className="combined-timer__main"
        onBlur={(event) => {
          if (
            shouldCloseOverlayOnFocusLeave(
              event.currentTarget,
              event.relatedTarget,
            )
          ) {
            setPendingInterval(null);
            onTimerPickerOpenChange(false);
          }
        }}
      >
        {/* Anchor is circle-sized so the picker overlays the face. Positioning
            against full-height __main puts it below the popup (clipped). */}
        <div className="combined-timer__anchor">
          <button
            ref={timerButtonRef}
            type="button"
            className={
              timerDue
                ? "combined-timer__trigger combined-timer__trigger--due"
                : "combined-timer__trigger"
            }
            aria-haspopup="listbox"
            aria-expanded={timerPickerOpen}
            aria-label={timerDue ? "Timer" : `Timer, ${countdown}`}
            disabled={schedulingTimer}
            onClick={() => onTimerPickerOpenChange(!timerPickerOpen)}
            onKeyDown={(event) => {
              if (event.key === "ArrowDown" || event.key === "ArrowUp") {
                event.preventDefault();
                moveTimerSelection(event.key === "ArrowDown" ? 1 : -1);
              } else if (event.key === "Enter" && pendingInterval !== null) {
                event.preventDefault();
                onSelectInterval(pendingInterval);
                setPendingInterval(null);
              } else if (event.key === "Escape") {
                event.preventDefault();
                setPendingInterval(null);
                onTimerPickerOpenChange(false);
              } else if (event.key === "Tab") {
                if (event.shiftKey) {
                  event.preventDefault();
                  onTimerPrevious();
                } else if (pendingInterval !== null) {
                  onSelectInterval(pendingInterval);
                  setPendingInterval(null);
                }
              }
            }}
          >
            <svg
              className="combined-timer__face"
              viewBox="0 0 100 100"
              aria-hidden="true"
              focusable="false"
            >
              <circle className="combined-timer__bezel" cx="50" cy="50" r="46" />
              {remainingRatio > 0 && (
                <circle
                  className="combined-timer__sweep"
                  cx="50"
                  cy="50"
                  r="46"
                  pathLength={1}
                  strokeDasharray={1}
                  strokeDashoffset={1 - remainingRatio}
                  transform="rotate(-90 50 50)"
                />
              )}
            </svg>
            <strong className="combined-timer__value" role="timer">
              {countdown}
            </strong>
          </button>
          {timerPickerOpen && (
            <div
              className="combined-timer__picker"
              role="listbox"
              aria-label="Start timer"
            >
              {TIMER_INTERVALS.map((minutes) => (
                <button
                  key={minutes}
                  type="button"
                  tabIndex={-1}
                  role="option"
                  aria-selected={displayedInterval === minutes}
                  disabled={schedulingTimer}
                  onMouseDown={(event) => event.preventDefault()}
                  onClick={() => onSelectInterval(minutes)}
                >
                  {minutes} min
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      <button
        ref={dashboardButtonRef}
        type="button"
        className="combined-dashboard-link"
        aria-label="Open dashboard"
        title="Open dashboard"
        onKeyDown={(event) => {
          if (event.key === "Tab" && !event.shiftKey) {
            event.preventDefault();
            onDashboardNext();
          }
        }}
        onClick={onOpenDashboard}
      >
        <ExpandIcon />
      </button>
    </header>
  );
}

export function nextMetricIndex(index: number, metricCount: number) {
  return index + 1 < metricCount ? index + 1 : null;
}

export function adjacentTimerInterval(current: number, direction: -1 | 1) {
  const currentIndex = TIMER_INTERVALS.findIndex(
    (interval) => interval === current,
  );
  const nextIndex = Math.max(
    0,
    Math.min(
      TIMER_INTERVALS.length - 1,
      (currentIndex < 0 ? 0 : currentIndex) + direction,
    ),
  );
  return TIMER_INTERVALS[nextIndex];
}

export function firstScorablePulse(pulses: Pulse[]): Pulse | null {
  return pulses.find((pulse) => pulse.metricIds.length > 0) ?? null;
}

/**
 * Sticky Metric-due latch: turns on when the timer is due, stays on through a
 * restarted clock, and clears only after a Metric check-in is saved.
 * Persisted so popup remounts (every summon) do not drop the glow.
 */
export function holdMetricDue(
  held: boolean,
  timerDue: boolean,
  metricCheckInSaved: boolean,
): boolean {
  if (metricCheckInSaved) return false;
  return held || timerDue;
}

function setHeldMetricDue(
  setMetricDue: (update: (held: boolean) => boolean) => void,
  timerDue: boolean,
  metricCheckInSaved: boolean,
) {
  setMetricDue((held) => {
    const next = holdMetricDue(held, timerDue, metricCheckInSaved);
    writeMetricDueHeld(next);
    return next;
  });
}

function PopupContent({
  onDismiss,
  onComplete,
}: {
  onDismiss: () => Promise<void>;
  onComplete: (save: () => Promise<number | null>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [selectedPulseId, setSelectedPulseId] = useState<number | null>(null);
  const [metricIndex, setMetricIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, RatingValue | null>>({});
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText, tagIds: brainDumpTagIds } = brainDumpDraft;
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const brainDumpHistory = useRecentBrainDumpHistory(brainDumpText, setError);
  const composerTagProps = useComposerTagProps(
    loaded?.tags ?? [],
    brainDumpTagIds,
    brainDumpHistory.viewingDump,
  );
  const handleTagsChange = useCallback(
    (tagIds: number[]) =>
      setBrainDumpDraft((draft) => ({ ...draft, tagIds })),
    [setBrainDumpDraft],
  );
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [schedulingTimer, setSchedulingTimer] = useState(false);
  const [metricDue, setMetricDue] = useState(() => readMetricDueHeld());
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const brainDumpRef = useRef<HTMLTextAreaElement | null>(null);
  const pulseButtonsRef = useRef<HTMLDivElement | null>(null);
  const selectedPulseButtonRef = useRef<HTMLButtonElement | null>(null);
  const timerButtonRef = useRef<HTMLButtonElement | null>(null);
  const dashboardButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const taskScrollThumbRef = useRef<HTMLDivElement | null>(null);
  const liveTasksRef = useRef<HTMLDivElement | null>(null);
  const stickToLiveRef = useRef(true);
  const isLoaded = loaded !== null;
  const enabledPulseButtons = () =>
    pulseButtonsRef.current?.querySelectorAll<HTMLButtonElement>(
      "button:not(:disabled)",
    );
  const hiddenPulseIds = readHiddenPulseIds();
  const visiblePulses = loaded?.pulses.filter(
    (pulse) => !hiddenPulseIds.has(pulse.id),
  ) ?? [];
  const selectedPulse = visiblePulses.find((pulse) => pulse.id === selectedPulseId) ?? null;
  const pulseMetrics = selectedPulse
    ? selectedPulse.metricIds.flatMap((id) => {
        const metric = loaded?.metrics.find((candidate) => candidate.id === id);
        return metric ? [metric] : [];
      })
    : [];
  const activeMetric = pulseMetrics[metricIndex] ?? null;
  const ratingKey = (metricId: number) => `${selectedPulseId}:${metricId}`;
  const timerDue = loaded !== null && isTimerDue(loaded.timer, nowMs);
  const tasksByStatus = groupTasksByStatus(loaded?.tasks ?? []);
  const activeTasks = tasksByStatus.active;
  const upNextTasks = tasksByStatus.up_next;
  // Working tasks lead the popup as hero rows; everything else recedes into
  // the plain lane lists below, so the popup answers "what am I doing" at a
  // glance instead of making that item look like every other row.
  const workingTasks = activeTasks.filter((task) => task.workingNow);
  const idleActiveTasks = activeTasks.filter((task) => !task.workingNow);
  // Nobody's working: nudge the row that would start one, active first.
  const nudgeTaskId =
    workingTasks.length === 0
      ? (idleActiveTasks[0] ?? upNextTasks[0])?.id ?? null
      : null;
  const recentClosed = recentlyClosedTasks(loaded?.tasks ?? [], nowMs);
  const recentClosedKey = recentClosed.map((task) => task.id).join(",");
  // One drag list spanning both lanes: dropping on a row of the other lane is
  // what moves a task between Active and Up next. An empty lane still offers
  // its placeholder as a drop target.
  // Hero rows (working tasks) aren't a drag source or target, so once idle
  // active rows run out, the lane still needs a rendered placeholder id —
  // otherwise nothing in the DOM carries EMPTY_ACTIVE_ROW to drop onto.
  const activeLaneIds = idleActiveTasks.length
    ? activeTasks.map((task) => task.id)
    : [...workingTasks.map((task) => task.id), EMPTY_ACTIVE_ROW];
  const boardRowIds = [
    ...activeLaneIds,
    ...(upNextTasks.length
      ? upNextTasks.map((task) => task.id)
      : [EMPTY_UP_NEXT_ROW]),
  ];
  const boardSort = useListSort(
    "popup-task",
    boardRowIds,
    (ids, draggedId, targetId) => void dropTask(ids, draggedId, targetId),
    CARD_CONTROLS,
  );

  useEffect(() => {
    setHeldMetricDue(setMetricDue, timerDue, false);
  }, [timerDue]);

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      listMetrics(),
      listPulses(),
      listTasks(),
      loadTodayStretches(),
      getTimerState(),
      listTags(),
    ])
      .then(([metrics, pulses, tasks, workStretches, timer, tags]) => {
        if (cancelled) return;
        const visible = pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id));
        setLoaded({ metrics, pulses, tasks, workStretches, timer, tags });
        setSelectedPulseId(firstScorablePulse(visible)?.id ?? null);
        setError(null);
      })
      .catch((e) => {
        if (!cancelled) setError(String(e));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    const refreshLive = () => {
      void Promise.all([
        listTasks(),
        loadTodayStretches(),
        getTimerState(),
        listTags(),
      ]).then(([tasks, workStretches, timer, tags]) => {
        setLoaded((current) =>
          current ? { ...current, tasks, workStretches, timer, tags } : current,
        );
      });
    };
    const stops = ["phase-changed", "data-changed"].map((event) =>
      subscribeTauriEvent(event, refreshLive),
    );
    return () => stops.forEach((stop) => stop());
  }, []);

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (!isLoaded) return;
    requestAnimationFrame(() => {
      const brainDump = brainDumpRef.current;
      if (brainDump) {
        brainDump.focus();
        const end = brainDump.value.length;
        brainDump.setSelectionRange(end, end);
      }
    });
  }, [isLoaded]);

  const syncTaskListThumb = () => {
    const list = taskListRef.current;
    const thumb = taskScrollThumbRef.current;
    if (!list || !thumb) return;
    const { scrollTop, scrollHeight, clientHeight } = list;
    const overflow = scrollHeight - clientHeight;
    if (overflow <= 1) {
      thumb.style.opacity = "0";
      return;
    }
    const size = Math.max(20, (clientHeight * clientHeight) / scrollHeight);
    thumb.style.opacity = "1";
    thumb.style.height = `${size}px`;
    thumb.style.transform = `translateY(${(scrollTop / overflow) * (clientHeight - size)}px)`;
  };

  useLayoutEffect(() => {
    if (stickToLiveRef.current) {
      const list = taskListRef.current;
      const live = liveTasksRef.current;
      if (list && live) list.scrollTop = live.offsetTop;
    }
    syncTaskListThumb();
  }, [isLoaded, recentClosedKey, loaded?.tasks]);

  useEffect(() => {
    const list = taskListRef.current;
    if (!list) return;
    const observer = new ResizeObserver(() => syncTaskListThumb());
    observer.observe(list);
    return () => observer.disconnect();
  }, [isLoaded]);

  const openDashboard = async () => {
    await showDashboard();
    await onDismiss();
  };

  const applyTimer = async (minutes: number) => {
    if (schedulingTimer) return;
    setSchedulingTimer(true);
    setError(null);
    try {
      const timer = await startTimer(minutes);
      setLoaded((current) => (current ? { ...current, timer } : current));
      setNowMs(Date.now());
      setTimerPickerOpen(false);
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSchedulingTimer(false);
    }
  };

  const updateTaskStatus = async (
    task: Task,
    status: "active" | "up_next" | "completed",
  ) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await setTaskStatus(task.id, status);
      const workStretches = await loadTodayStretches();
      setLoaded({
        ...loaded,
        workStretches,
        tasks: loaded.tasks.map((t) => (t.id === task.id ? updated : t)),
      });
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const updateTaskWorking = async (task: Task, working: boolean) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      const updated = await setTaskWorking(task.id, working);
      const workStretches = await loadTodayStretches();
      setLoaded({
        ...loaded,
        workStretches,
        tasks: loaded.tasks.map((candidate) =>
          candidate.id === task.id ? updated : candidate,
        ),
      });
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  /** Up next's play button is one move: into Active, already working. */
  const startUpNextTask = async (task: Task) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await setTaskStatus(task.id, "active");
      const updated = await setTaskWorking(task.id, true);
      const workStretches = await loadTodayStretches();
      setLoaded((current) =>
        current
          ? {
              ...current,
              workStretches,
              tasks: current.tasks.map((candidate) =>
                candidate.id === task.id ? updated : candidate,
              ),
            }
          : current,
      );
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const dropTask = async (
    ids: number[],
    draggedId: number,
    targetId: number,
  ) => {
    if (!loaded || submitting) return;
    const dragged = loaded.tasks.find((task) => task.id === draggedId);
    if (!dragged) return;
    const targetStatus =
      targetId === EMPTY_ACTIVE_ROW
        ? "active"
        : targetId === EMPTY_UP_NEXT_ROW
          ? "up_next"
          : (loaded.tasks.find((task) => task.id === targetId)?.status ??
            dragged.status);
    setSubmitting(true);
    setError(null);
    try {
      // Pin against the moved task, never the pre-drop snapshot: leaving
      // Active clears working now, and a stale pin would hoist the task to
      // the top of the order it just left.
      const moved =
        targetStatus === dragged.status
          ? null
          : await setTaskStatus(draggedId, targetStatus);
      await reorderTasks(
        pinnedIdOrder(
          ids,
          moved
            ? loaded.tasks.map((task) => (task.id === moved.id ? moved : task))
            : loaded.tasks,
        ),
      );
      const tasks = await listTasks();
      const workStretches = await loadTodayStretches();
      setLoaded((current) =>
        current ? { ...current, tasks, workStretches } : current,
      );
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const restAllWorking = async () => {
    if (!loaded || submitting) return;
    if (!loaded.tasks.some((task) => task.workingNow)) return;
    setSubmitting(true);
    setError(null);
    try {
      const updates = await stopAllWorkingNow();
      const byId = new Map(updates.map((task) => [task.id, task]));
      const workStretches = await loadTodayStretches();
      setLoaded({
        ...loaded,
        workStretches,
        tasks: loaded.tasks.map((task) => byId.get(task.id) ?? task),
      });
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const addTask = async (start = false) => {
    const title = taskTitle.trim();
    if (!loaded || submitting || !title) return;
    setSubmitting(true);
    setError(null);
    try {
      let task = await createTask(title, "", "active");
      // Reconcile as soon as create commits so a later start/stretch failure
      // cannot hide the row and leave a retryable draft (duplicate tasks).
      setLoaded((current) =>
        current
          ? { ...current, tasks: [...current.tasks, task] }
          : current,
      );
      setTaskTitle("");
      setAddingTask(false);

      if (start) {
        try {
          task = await setTaskWorking(task.id, true);
          const workStretches = await loadTodayStretches();
          setLoaded((current) =>
            current
              ? {
                  ...current,
                  workStretches,
                  tasks: current.tasks.map((item) =>
                    item.id === task.id ? task : item,
                  ),
                }
              : current,
          );
        } catch (e) {
          setError(String(e));
        }
      }

      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const ratingsForPulse = (
    pulse: Pulse,
    checkInRatings: Record<string, RatingValue | null>,
  ): MetricRatingInput[] =>
    pulse.metricIds.flatMap((id) => {
      const value = checkInRatings[`${pulse.id}:${id}`];
      return value == null ? [] : [{ metricId: id, value }];
    });

  const saveMetrics = async (
    pulse: Pulse,
    checkInRatings: Record<string, RatingValue | null>,
  ) => {
    const ratingsInput = ratingsForPulse(pulse, checkInRatings);
    if (ratingsInput.length === 0) return;
    await submitMetricCheckIn(pulse.id, ratingsInput);
    setRatings({});
    setHeldMetricDue(setMetricDue, timerDue, true);
    await emit("data-changed");
  };

  const saveBrainDump = async () => {
    const text = trimBrainDumpDraft(brainDumpDraft);
    if (!text) return;
    await submitBrainDump(text, null, brainDumpTagIds);
    setBrainDumpDraft({ text: "", tagIds: [] });
    await brainDumpHistory.refresh();
    await emit("data-changed");
  };

  const submitBrainDumpDraft = async () => {
    if (submitting || !brainDumpText.trim()) return;
    setSubmitting(true);
    setError(null);
    try {
      await saveBrainDump();
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const completePopup = async (
    pulse: Pulse,
    checkInRatings: Record<string, RatingValue | null>,
  ) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(async () => {
        await saveMetrics(pulse, checkInRatings);
        return timerDue ? loaded.timer.intervalMinutes : null;
      });
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const answerMetric = async (value: RatingValue) => {
    if (!activeMetric || !selectedPulse || submitting) return;
    const nextRatings = {
      ...ratings,
      [ratingKey(activeMetric.id)]: value,
    };
    setRatings(nextRatings);
    const nextIndex = nextMetricIndex(metricIndex, pulseMetrics.length);
    if (nextIndex !== null) {
      setMetricIndex(nextIndex);
      return;
    }
    await completePopup(selectedPulse, nextRatings);
  };

  if (!loaded) {
    return (
      <div className="popup-workspace popup-workspace--loading">
        {error ? (
          <div className="popup-workspace__error" role="alert">
            {error}
          </div>
        ) : (
          "Loading..."
        )}
      </div>
    );
  }

  const workingCount = workingTasks.length;
  // Working tasks lead as hero rows: the one thing the popup wants you to
  // see first, so it reads at a glance instead of blending into the list.
  const renderHeroRow = (task: Task) => (
    <li className="now-hero" key={task.id}>
      <div className="now-hero__lead">
        <WorkingToggle
          task={task}
          playPause
          nowMs={nowMs}
          clockedSeconds={workedSecondsToday(
            loaded.workStretches,
            nowMs,
            task.id,
          )}
          tabIndex={-1}
          disabled={submitting}
          onToggle={(working) => updateTaskWorking(task, working)}
        />
      </div>
      <div className="now-hero__body">
        <span className="now-hero__title">{task.title}</span>
      </div>
      <div className="now-task__actions">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Move ${task.title} to Up next`}
          title="Up next"
          onClick={() => updateTaskStatus(task, "up_next")}
          disabled={submitting}
        >
          <QueueIcon />
        </button>
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Complete ${task.title}`}
          title="Complete"
          onClick={() => updateTaskStatus(task, "completed")}
          disabled={submitting}
        >
          <CheckIcon />
        </button>
      </div>
    </li>
  );
  // Idle lanes share a row: lead play control, title, trailing status
  // actions. Closed history is a quieter restore row, not in the drag list.
  const renderTaskRow = (task: Task) => (
    <li
      className={`now-task${
        task.id === nudgeTaskId ? " now-task--nudge" : ""
      }${boardSort.draggingId === task.id ? " is-dragging" : ""}${
        boardSort.overId === task.id ? " is-drop-target" : ""
      }`}
      key={task.id}
      {...boardSort.rowProps(task.id)}
    >
      <div className="now-task__actions now-task__lead">
        {task.status === "active" ? (
          <WorkingToggle
            task={task}
            playPause
            nowMs={nowMs}
            tabIndex={-1}
            disabled={submitting}
            onToggle={(working) => updateTaskWorking(task, working)}
          />
        ) : (
          <button
            type="button"
            tabIndex={-1}
            className="working-toggle working-toggle--play-pause"
            aria-label={`Start working on ${task.title}`}
            title="Move to Active and start working"
            disabled={submitting}
            onClick={() => void startUpNextTask(task)}
          >
            <PlayIcon />
          </button>
        )}
      </div>
      <span className="now-task__title">{task.title}</span>
      <div className="now-task__actions">
        {task.status === "active" && (
          <button
            type="button"
            tabIndex={-1}
            aria-label={`Move ${task.title} to Up next`}
            title="Up next"
            onClick={() => updateTaskStatus(task, "up_next")}
            disabled={submitting}
          >
            <QueueIcon />
          </button>
        )}
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Complete ${task.title}`}
          title="Complete"
          onClick={() => updateTaskStatus(task, "completed")}
          disabled={submitting}
        >
          <CheckIcon />
        </button>
      </div>
    </li>
  );
  const renderClosedRow = (task: Task) => (
    <li
      className={`now-task now-task--${task.status}`}
      key={task.id}
    >
      <div className="now-task__mark now-task__lead" aria-hidden="true">
        {task.status === "completed" ? <CheckIcon /> : <CancelledMark />}
      </div>
      <span className="now-task__title">{task.title}</span>
      <div className="now-task__actions">
        <button
          type="button"
          tabIndex={-1}
          aria-label={`Return ${task.title} to Active`}
          title="Return to Active"
          onClick={() => updateTaskStatus(task, "active")}
          disabled={submitting}
        >
          <RestoreIcon />
        </button>
      </div>
    </li>
  );
  const taskView = (
    <section className="now-card" aria-label="Tasks">
      {workingTasks.length > 0 && (
        <ul className="now-hero-list">{workingTasks.map(renderHeroRow)}</ul>
      )}
      <div className="now-card__scroller">
      <div
        className="now-card__tasks"
        ref={taskListRef}
        onScroll={() => {
          const list = taskListRef.current;
          const live = liveTasksRef.current;
          if (list && live) {
            stickToLiveRef.current = list.scrollTop >= live.offsetTop - 2;
          }
          syncTaskListThumb();
        }}
      >
        {recentClosed.length > 0 && (
          <section
            className="now-group now-group--closed"
            aria-labelledby="popup-done-tasks"
          >
            <header className="now-group__head">
              <h2 id="popup-done-tasks">Done</h2>
              <span>{recentClosed.length}</span>
            </header>
            <ul className="now-list">{recentClosed.map(renderClosedRow)}</ul>
          </section>
        )}
        <div className="now-card__live" ref={liveTasksRef}>
          <section className="now-group" aria-labelledby="popup-active-tasks">
          <header className="now-group__head">
            <h2 id="popup-active-tasks">Active</h2>
            <span>{activeTasks.length}</span>
            {workingCount > 0 && (
              <button
                type="button"
                tabIndex={-1}
                className="now-group__rest"
                aria-label={`Rest — stop ${workingCount} working ${workingCount === 1 ? "task" : "tasks"}`}
                title="Rest — stop all working tasks"
                disabled={submitting}
                onClick={() => void restAllWorking()}
              >
                <NestIcon name="moon" />
              </button>
            )}
            <button
              type="button"
              tabIndex={-1}
              className="now-group__add"
              aria-label="Add active task"
              aria-expanded={addingTask}
              title="Add active task"
              onClick={() => {
                setAddingTask((open) => !open);
                if (!addingTask) {
                  requestAnimationFrame(() => taskInputRef.current?.focus());
                }
              }}
            >
              +
            </button>
          </header>
          {addingTask && (
            <div className="now-task now-task--composer">
              <input
                ref={taskInputRef}
                tabIndex={-1}
                aria-label="New active task"
                autoComplete="off"
                disabled={submitting}
                placeholder="Add an active task…"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTask(event.metaKey || event.ctrlKey);
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setAddingTask(false);
                  }
                }}
              />
              <button
                type="button"
                tabIndex={-1}
                aria-label="Create task"
                title="Create task"
                disabled={submitting || !taskTitle.trim()}
                onClick={() => void addTask()}
              >
                +
              </button>
              <button
                type="button"
                tabIndex={-1}
                aria-label="Create and start task"
                title="Create and start (⌘↵)"
                disabled={submitting || !taskTitle.trim()}
                onClick={() => void addTask(true)}
              >
                <PlayIcon />
              </button>
            </div>
          )}
          {idleActiveTasks.length === 0 ? (
            <p
              className={`now-card__empty${
                boardSort.overId === EMPTY_ACTIVE_ROW ? " is-drop-target" : ""
              }`}
              {...boardSort.rowProps(EMPTY_ACTIVE_ROW)}
            >
              {workingTasks.length > 0
                ? "Nothing else active right now."
                : "Nothing active right now."}
            </p>
          ) : (
            <ul className="now-list">{idleActiveTasks.map(renderTaskRow)}</ul>
          )}
        </section>
        <section
          className="now-group now-group--up-next"
          aria-labelledby="popup-up-next-tasks"
        >
          <header className="now-group__head">
            <h2 id="popup-up-next-tasks">Up next</h2>
            <span>{upNextTasks.length}</span>
          </header>
          {upNextTasks.length === 0 ? (
            <p
              className={`now-card__empty${
                boardSort.overId === EMPTY_UP_NEXT_ROW ? " is-drop-target" : ""
              }`}
              {...boardSort.rowProps(EMPTY_UP_NEXT_ROW)}
            >
              Nothing queued up next.
            </p>
          ) : (
            <ul className="now-list">{upNextTasks.map(renderTaskRow)}</ul>
          )}
        </section>
        </div>
      </div>
      <div
        className="now-card__scroll-thumb"
        ref={taskScrollThumbRef}
        aria-hidden="true"
      />
      </div>
    </section>
  );

  const countdown = timerDue
    ? "0:00"
    : formatTimerCountdown(loaded.timer.nextDueAt, nowMs);
  const remainingRatio = timerDue
    ? 0
    : Math.min(
        1,
        timerRemainingSeconds(loaded.timer.nextDueAt, nowMs) /
          (loaded.timer.intervalMinutes * 60),
      );
  return (
    <div
      className="popup-workspace"
      onPointerDownCapture={(event) => {
        const target = event.target;
        // Anchor (circle + list), not full-height __main — clock chrome counts as away.
        if (
          shouldDismissOnPointerDown(
            timerPickerOpen,
            target,
            ".combined-timer__anchor",
          )
        ) {
          setTimerPickerOpen(false);
        }
        if (
          shouldDismissOnPointerDown(
            addingTask,
            target,
            ".now-task--composer, .now-group__add",
          )
        ) {
          setAddingTask(false);
        }
      }}
    >
      <aside className="popup-clock">
        <PopupTopPanel
          timerDue={timerDue}
          countdown={countdown}
          remainingRatio={remainingRatio}
          timerPickerOpen={timerPickerOpen}
          schedulingTimer={schedulingTimer}
          selectedInterval={loaded.timer.intervalMinutes}
          timerButtonRef={timerButtonRef}
          dashboardButtonRef={dashboardButtonRef}
          onTimerPickerOpenChange={setTimerPickerOpen}
          onSelectInterval={(minutes) => void applyTimer(minutes)}
          onTimerPrevious={() => {
            const buttons = enabledPulseButtons();
            const previous = buttons?.item((buttons?.length ?? 0) - 1);
            (previous ?? brainDumpRef.current)?.focus();
          }}
          onDashboardNext={() => brainDumpRef.current?.focus()}
          onOpenDashboard={() => void openDashboard()}
        />
      </aside>

      <main className="popup-tasks">
        <section
          className={`pulse-panel${metricDue ? " pulse-panel--due" : ""}`}
          aria-label="Metrics"
          onKeyDown={(event) => {
            if (event.key >= "1" && event.key <= "5") {
              event.preventDefault();
              void answerMetric(Number(event.key) as RatingValue);
            }
          }}
        >
          <div className="pulse-panel__header">
            {activeMetric && (
              <div
                className="metric-step__title"
                key={`${selectedPulseId}:${activeMetric.id}`}
                aria-live="polite"
              >
                <NestIcon
                  name={activeMetric.icon}
                  color={resolveMetricColorFromList(
                    loaded?.metrics ?? [],
                    activeMetric.id,
                  )}
                />
                <h2>{activeMetric.name}</h2>
              </div>
            )}
            {visiblePulses.length > 0 && (
              <div
                ref={pulseButtonsRef}
                className="popup-pulse-toggle"
                role="group"
                aria-label="Pulses"
                onKeyDown={(event) => {
                  if (event.key !== "Tab") return;
                  const buttons = event.currentTarget.querySelectorAll(
                    "button:not(:disabled)",
                  );
                  const boundary = buttons.item(
                    event.shiftKey ? 0 : buttons.length - 1,
                  );
                  if (boundary !== event.target) return;
                  event.preventDefault();
                  if (event.shiftKey) brainDumpRef.current?.focus();
                  else timerButtonRef.current?.focus();
                }}
              >
                {visiblePulses.map((pulse) => (
                  <button
                    key={pulse.id}
                    ref={
                      pulse.id === selectedPulseId
                        ? selectedPulseButtonRef
                        : undefined
                    }
                    type="button"
                    aria-label={pulse.name}
                    title={pulse.name}
                    aria-pressed={pulse.id === selectedPulseId}
                    disabled={submitting || pulse.metricIds.length === 0}
                    onFocus={() => {
                      if (pulse.id === selectedPulseId) return;
                      setSelectedPulseId(pulse.id);
                      setMetricIndex(0);
                    }}
                    onClick={() => {
                      setSelectedPulseId(pulse.id);
                      setMetricIndex(0);
                    }}
                  >
                    <NestIcon name={pulse.icon} />
                  </button>
                ))}
              </div>
            )}
          </div>
          {activeMetric ? (
            <div
              className="metric-step"
              key={`${selectedPulseId}:${activeMetric.id}:ratings`}
            >
              <div
                className="metric-row__buttons"
                role="group"
                aria-label={activeMetric.name}
              >
                {RATING_VALUES.map((value) => {
                  const selected = ratings[ratingKey(activeMetric.id)] === value;
                  return (
                    <button
                      key={value}
                      type="button"
                      tabIndex={-1}
                      aria-label={`${value} out of 5`}
                      aria-pressed={selected}
                      disabled={submitting}
                      className={`metric-rating metric-rating--v${value}${
                        selected ? " metric-rating--active" : ""
                      }`}
                      onClick={() => void answerMetric(value)}
                    >
                      {value}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <div className="combined-empty">
              {visiblePulses.length
                ? "This pulse has no metrics yet."
                : loaded.pulses.length
                  ? "No pulses are shown in the popup. Turn one on in Metrics."
                  : "Create a pulse in the Metrics dashboard."}
            </div>
          )}
        </section>

        {taskView}
      </main>

      <section className="popup-dump" aria-label="Brain dump">
        <BrainDumpHistoryControls
          canViewPrevious={brainDumpHistory.canViewPrevious}
          canViewNext={brainDumpHistory.canViewNext}
          onPrevious={brainDumpHistory.showPrevious}
          onNext={brainDumpHistory.showNext}
        />
        <textarea
          ref={brainDumpRef}
          id="popup-brain-dump"
          className="combined-input"
          aria-label={
            brainDumpHistory.viewingHistory
              ? "Saved brain dump, read only"
              : "Brain dump"
          }
          autoCapitalize="off"
          autoComplete="off"
          autoCorrect="off"
          spellCheck={false}
          value={brainDumpHistory.text}
          readOnly={brainDumpHistory.viewingHistory}
          onChange={(event) =>
            setBrainDumpDraft((draft) => ({ ...draft, text: event.target.value }))
          }
          onKeyDown={(event) => {
            if (event.key === "Tab") {
              event.preventDefault();
              if (event.shiftKey) dashboardButtonRef.current?.focus();
              else {
                (
                  selectedPulseButtonRef.current ?? timerButtonRef.current
                )?.focus();
              }
              return;
            }
            if (
              !brainDumpHistory.viewingHistory &&
              isBrainDumpSubmitShortcut({
                key: event.key,
                metaKey: event.metaKey,
                ctrlKey: event.ctrlKey,
                isComposing: event.nativeEvent.isComposing,
              })
            ) {
              event.preventDefault();
              void submitBrainDumpDraft();
            }
          }}
        />

        <BrainDumpTags
          tags={composerTagProps.tags}
          selectedIds={composerTagProps.selectedIds}
          disabled={brainDumpHistory.viewingHistory}
          onChange={handleTagsChange}
        />

        {error && (
          <div className="popup-workspace__error" role="alert">
            {error}
          </div>
        )}
      </section>
    </div>
  );
}

export default PopupContent;
