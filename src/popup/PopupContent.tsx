import {
  useCallback,
  useEffect,
  useLayoutEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import { emit } from "@tauri-apps/api/event";
import { pulseActivity } from "../lib/activityPulse";
import {
  createTask,
  getTimerState,
  latestPhaseCheckIn,
  listMetrics,
  listPhases,
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
  Phase,
  PhaseCheckIn,
  Pulse,
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
import { phaseName, phaseTone } from "../dashboard/lib/period";
import { AmbientVisualizer } from "../dashboard/components/AmbientVisualizer";
import { useBackgroundStyle } from "../dashboard/hooks/useBackgroundStyle";
import { useBackgroundTuning } from "../dashboard/hooks/useBackgroundTuning";
import { useTileIcons } from "../dashboard/hooks/useTileIcons";
import type { TileId } from "../dashboard/lib/overviewGrid";
import { workedSecondsToday } from "../dashboard/lib/workTimeline";
import {
  groupTasksByStatus,
  pinnedIdOrder,
  recentlyClosedTasks,
} from "../dashboard/lib/tasks";
import { CARD_CONTROLS, useListSort } from "../dashboard/hooks/useListSort";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
  useRecentBrainDumpHistory,
} from "../lib/brainDumpDraft";
import { setContentEditableCaretToEnd } from "../lib/brainDumpRichText";
import { readHiddenPulseIds } from "../lib/pulseVisibility";
import { readMetricDueHeld, writeMetricDueHeld } from "../lib/metricDue";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import { NestIcon } from "../dashboard/components/PulseIcon";
import { useComposerTagProps } from "../dashboard/components/BrainDumpTags";
import { BrainDumpHistoryControls } from "../dashboard/components/BrainDumpHistoryControls";
import { MetricCheckIn } from "../dashboard/components/MetricCheckIn";
import { BrainDumpSurface } from "../dashboard/components/BrainDumpSurface";
import { startPopupWindowDrag } from "./windowDrag";
import "./PopupContent.css";

/** Stable identity so the composer's tag memo holds before tags load. */
const EMPTY_TAGS: Tag[] = [];

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
  phases: Phase[];
  latestPhase: PhaseCheckIn | null;
};

const loadTodayStretches = (nowMs: number = Date.now()) => {
  const now = Math.floor(nowMs / 1000);
  const from = Math.floor(new Date(nowMs).setHours(0, 0, 0, 0) / 1000);
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

export type PopupTabId = "now" | "dump";

export const POPUP_TABS = [
  { id: "now", label: "Tasks and metrics", tileIcon: "tasks" },
  { id: "dump", label: "Brain dump", tileIcon: "brainDump" },
] as const satisfies ReadonlyArray<{
  id: PopupTabId;
  label: string;
  tileIcon: TileId;
}>;

/** Tab / Shift+Tab flip between the two tabs; ⌘1 / ⌘2 pick one by position. */
export function nextPopupTab(
  event: Pick<
    KeyboardEvent,
    "key" | "metaKey" | "ctrlKey" | "altKey" | "isComposing"
  >,
  current: PopupTabId,
): PopupTabId | null {
  if (event.isComposing || event.ctrlKey || event.altKey) return null;
  if (event.key === "Tab" && !event.metaKey) {
    return current === "now" ? "dump" : "now";
  }
  if (!event.metaKey) return null;
  return POPUP_TABS[Number(event.key) - 1]?.id ?? null;
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
  onTimerPickerOpenChange,
  onSelectInterval,
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
  onTimerPickerOpenChange: (open: boolean) => void;
  onSelectInterval: (minutes: number) => void;
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
      className={timerDue ? "combined-timer combined-timer--due" : "combined-timer"}
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
        {/* The picker positions against the trigger, so it drops just below. */}
        <div className="combined-timer__anchor">
          <button
            ref={timerButtonRef}
            type="button"
            className="combined-timer__trigger"
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
              }
            }}
          >
            <strong className="combined-timer__value" role="timer">
              {countdown}
            </strong>
            <span className="combined-timer__interval">
              {selectedInterval} min
            </span>
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
        type="button"
        className="combined-dashboard-link"
        aria-label="Open dashboard"
        title="Open dashboard"
        onClick={onOpenDashboard}
      >
        <ExpandIcon />
      </button>
      <span className="combined-timer__track" aria-hidden="true">
        {remainingRatio > 0 && (
          <span
            className="combined-timer__sweep"
            style={{ transform: `scaleX(${remainingRatio})` }}
          />
        )}
      </span>
    </header>
  );
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

/**
 * Owns the brain dump draft so a keystroke re-renders only this section.
 * Held by the popup shell it used to live in, every character re-rendered the
 * task board, pulse buttons and timer as well.
 */
function PopupBrainDump({
  tags,
  editorRef,
  busy,
  onBusyChange,
  onError,
}: {
  tags: Tag[];
  editorRef: RefObject<HTMLElement | null>;
  busy: boolean;
  onBusyChange: (busy: boolean) => void;
  onError: (error: string | null) => void;
}) {
  const [draft, setDraft] = useBrainDumpDraft();
  const icons = useTileIcons();
  const draftRevision = `${draft.text}\n${draft.tagIds.join(",")}`;
  const history = useRecentBrainDumpHistory(draft.text, onError, draftRevision);
  const tagProps = useComposerTagProps(tags, draft.tagIds, history.viewingDump);
  const handleTagsChange = useCallback(
    (tagIds: number[]) => setDraft((current) => ({ ...current, tagIds })),
    [setDraft],
  );

  const submitDraft = async () => {
    if (busy || !trimBrainDumpDraft(draft)) return;
    onBusyChange(true);
    onError(null);
    try {
      await submitBrainDump(draft.text, draft.tagIds);
      setDraft({ text: "", tagIds: [] });
      await history.refresh();
      await emit("data-changed");
    } catch (e) {
      onError(String(e));
    } finally {
      onBusyChange(false);
    }
  };

  return (
    <BrainDumpSurface
      className="brain-dump-surface--popup"
      text={history.text}
      tagIds={tagProps.selectedIds}
      tags={tagProps.tags}
      readOnly={history.viewingHistory}
      tagsDisabled={history.viewingHistory}
      headerStart={
        <span className="brain-dump-surface__header-icon" aria-hidden="true">
          <NestIcon name={icons.brainDump} />
        </span>
      }
      textareaLabel={
        history.viewingHistory ? "Saved brain dump, read only" : "Brain dump"
      }
      headerEnd={
        <BrainDumpHistoryControls
          canViewPrevious={history.canViewPrevious}
          canViewNext={history.canViewNext}
          onPrevious={history.showPrevious}
          onNext={history.showNext}
          submittedAt={history.viewingDump?.createdAt}
        />
      }
      onTextChange={(text) => setDraft((current) => ({ ...current, text }))}
      onTagsChange={handleTagsChange}
      dismissPopupsOnOutsideInteraction
      onKeyDown={(event) => {
        if (
          !history.viewingHistory &&
          isBrainDumpSubmitShortcut({
            key: event.key,
            metaKey: event.metaKey,
            ctrlKey: event.ctrlKey,
            isComposing: event.nativeEvent.isComposing,
          })
        ) {
          event.preventDefault();
          void submitDraft();
        }
      }}
      editorRef={editorRef}
    />
  );
}

function PopupContent({
  onDismiss,
  onComplete,
}: {
  onDismiss: () => Promise<void>;
  onComplete: (save: () => Promise<number | null>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const backgroundStyle = useBackgroundStyle();
  const backgroundTuning = useBackgroundTuning();
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [schedulingTimer, setSchedulingTimer] = useState(false);
  const [metricDue, setMetricDue] = useState(() => readMetricDueHeld());
  // Per-summon: the body remounts on every summon and the first load picks
  // the tab from whether the Timer is due.
  const [tab, setTab] = useState<PopupTabId>("dump");
  const icons = useTileIcons();
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const brainDumpRef = useRef<HTMLElement | null>(null);
  const selectedPulseButtonRef = useRef<HTMLButtonElement | null>(null);
  const timerButtonRef = useRef<HTMLButtonElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const taskScrollThumbRef = useRef<HTMLDivElement | null>(null);
  const liveTasksRef = useRef<HTMLDivElement | null>(null);
  const stickToLiveRef = useRef(true);

  useEffect(() => {
    const switchTab = (event: KeyboardEvent) => {
      const next = nextPopupTab(event, tab);
      if (!next) return;
      // Capture phase, stopped here: Tab never reaches a control's own
      // handler or the browser's focus walk, so it only ever switches views.
      event.preventDefault();
      event.stopPropagation();
      setTab(next);
    };
    window.addEventListener("keydown", switchTab, true);
    return () => window.removeEventListener("keydown", switchTab, true);
  }, [tab]);

  const isLoaded = loaded !== null;
  const hiddenPulseIds = readHiddenPulseIds();
  const visiblePulses =
    loaded?.pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id)) ?? [];
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
      ? ((idleActiveTasks[0] ?? upNextTasks[0])?.id ?? null)
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
      listPhases(true),
      latestPhaseCheckIn(),
    ])
      .then(
        ([
          metrics,
          pulses,
          tasks,
          workStretches,
          timer,
          tags,
          phases,
          latestPhase,
        ]) => {
          if (cancelled) return;
          // A due Timer summons the popup for Metric scoring; a manual
          // summon is usually for capturing a thought.
          setTab(isTimerDue(timer, Date.now()) ? "now" : "dump");
          setLoaded({
            metrics,
            pulses,
            tasks,
            workStretches,
            timer,
            tags,
            phases,
            latestPhase,
          });
          setError(null);
        },
      )
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
        latestPhaseCheckIn(),
      ]).then(([tasks, workStretches, timer, tags, latestPhase]) => {
        setLoaded((current) =>
          current
            ? { ...current, tasks, workStretches, timer, tags, latestPhase }
            : current,
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
      if (tab === "now") {
        // Focus inside the Metrics panel is what routes the 1–5 shortcuts.
        (selectedPulseButtonRef.current ?? timerButtonRef.current)?.focus();
        return;
      }
      const brainDump = brainDumpRef.current;
      if (brainDump) {
        brainDump.focus();
        setContentEditableCaretToEnd(brainDump);
      }
    });
  }, [isLoaded, tab]);

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
      if (status === "completed") pulseActivity();
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
        current ? { ...current, tasks: [...current.tasks, task] } : current,
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

  const saveMetrics = async (
    pulse: Pulse,
    ratingsInput: MetricRatingInput[],
  ) => {
    if (ratingsInput.length === 0) return;
    await submitMetricCheckIn(pulse.id, ratingsInput);
    setHeldMetricDue(setMetricDue, timerDue, true);
    pulseActivity();
    await emit("data-changed");
  };

  const completePopup = async (
    pulse: Pulse,
    ratingsInput: MetricRatingInput[],
  ) => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(async () => {
        await saveMetrics(pulse, ratingsInput);
        return timerDue ? loaded.timer.intervalMinutes : null;
      });
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
      throw e;
    }
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

  const currentPhaseName = loaded.latestPhase
    ? phaseName(
        loaded.latestPhase.phaseId,
        loaded.phases,
        loaded.latestPhase.phaseLabel,
      )
    : null;
  const isDoing = currentPhaseName
    ? phaseTone(currentPhaseName) === "doing"
    : false;

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
    <li className={`now-task now-task--${task.status}`} key={task.id}>
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
                      requestAnimationFrame(() =>
                        taskInputRef.current?.focus(),
                      );
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
                    boardSort.overId === EMPTY_ACTIVE_ROW
                      ? " is-drop-target"
                      : ""
                  }`}
                  {...boardSort.rowProps(EMPTY_ACTIVE_ROW)}
                >
                  {workingTasks.length > 0
                    ? "Nothing else active right now."
                    : "Nothing active right now."}
                </p>
              ) : (
                <ul className="now-list">
                  {idleActiveTasks.map(renderTaskRow)}
                </ul>
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
                    boardSort.overId === EMPTY_UP_NEXT_ROW
                      ? " is-drop-target"
                      : ""
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
      <PopupTopPanel
        timerDue={timerDue}
        countdown={countdown}
        remainingRatio={remainingRatio}
        timerPickerOpen={timerPickerOpen}
        schedulingTimer={schedulingTimer}
        selectedInterval={loaded.timer.intervalMinutes}
        timerButtonRef={timerButtonRef}
        onTimerPickerOpenChange={setTimerPickerOpen}
        onSelectInterval={(minutes) => void applyTimer(minutes)}
        onOpenDashboard={() => void openDashboard()}
      />

      <nav className="popup-tabs" aria-label="Popup tabs">
        {POPUP_TABS.map(({ id, label, tileIcon }, index) => (
          <button
            key={id}
            type="button"
            tabIndex={-1}
            className={`popup-tabs__tab${
              id === "now" && metricDue ? " popup-tabs__tab--due" : ""
            }`}
            aria-label={label}
            aria-pressed={tab === id}
            aria-keyshortcuts={`Meta+${index + 1}`}
            title={`${label} (⌘${index + 1})`}
            onClick={() => setTab(id)}
          >
            <NestIcon name={icons[tileIcon]} />
          </button>
        ))}
      </nav>

      {/* Both panes stay mounted so a half-scored Pulse, an open task
          composer and the task list's scroll survive a tab switch. */}
      <main className="popup-pane popup-tasks" hidden={tab !== "now"}>
        <AmbientVisualizer
          active={isDoing}
          style={backgroundStyle}
          tuning={backgroundTuning}
        />
        <MetricCheckIn
          metrics={loaded.metrics}
          pulses={visiblePulses}
          submitting={submitting}
          due={metricDue}
          emptyCopy={
            loaded.pulses.length
              ? "No pulses are shown in the popup. Turn one on in Metrics."
              : "Create a pulse in the Metrics dashboard."
          }
          onComplete={completePopup}
          selectedPulseButtonRef={selectedPulseButtonRef}
        />

        {taskView}
      </main>

      <section
        className="popup-pane popup-dump"
        aria-label="Brain dump"
        hidden={tab !== "dump"}
      >
        <PopupBrainDump
          tags={loaded?.tags ?? EMPTY_TAGS}
          editorRef={brainDumpRef}
          busy={submitting}
          onBusyChange={setSubmitting}
          onError={setError}
        />
      </section>

      {error && (
        <div className="popup-workspace__error" role="alert">
          {error}
        </div>
      )}
    </div>
  );
}

export default PopupContent;
