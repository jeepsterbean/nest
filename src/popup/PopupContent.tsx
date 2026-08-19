import { useEffect, useLayoutEffect, useRef, useState } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  createTask,
  getTimerState,
  listMetrics,
  listPulses,
  listTasks,
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
} from "../lib/types";
import {
  timerRemainingSeconds,
  TIMER_INTERVALS,
  formatTimerCountdown,
  isTimerDue,
} from "../dashboard/lib/time";
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
} from "../lib/brainDumpDraft";
import { readHiddenPulseIds } from "../lib/pulseVisibility";
import { readMetricDueHeld, writeMetricDueHeld } from "../lib/metricDue";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import { NestIcon } from "../dashboard/components/PulseIcon";
import { resolveMetricColorFromList } from "../lib/metricColors";
import "./PopupContent.css";

// Drop targets for a lane with no tasks in it. Negative so they can never
// collide with a task id.
const EMPTY_ACTIVE_ROW = -1;
const EMPTY_UP_NEXT_ROW = -2;

type LoadState = {
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  timer: TimerState;
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

/** Wheel on the task list scrolls it; the timer collapse only takes leftover motion. */
export function taskListOwnsWheel(
  deltaY: number,
  list: Pick<HTMLElement, "scrollTop" | "clientHeight" | "scrollHeight">,
) {
  if (deltaY < 0) return list.scrollTop > 0;
  if (deltaY > 0) {
    return list.scrollTop + list.clientHeight < list.scrollHeight - 1;
  }
  return false;
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

export function PopupTopPanel({
  timerDue,
  countdown,
  remainingRatio,
  timerPickerOpen,
  schedulingTimer,
  selectedInterval,
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
  onTimerPickerOpenChange: (open: boolean) => void;
  onSelectInterval: (minutes: number) => void;
  onOpenDashboard: () => void;
}) {
  return (
    <header className="combined-timer">
      <div
        className="combined-timer__main"
        onBlur={(event) => {
          if (!event.currentTarget.contains(event.relatedTarget)) {
            onTimerPickerOpenChange(false);
          }
        }}
      >
        <button
          type="button"
          className="combined-timer__trigger"
          aria-haspopup="listbox"
          aria-expanded={timerPickerOpen}
          aria-label={timerDue ? "Timer" : `Timer, ${countdown}`}
          disabled={schedulingTimer}
          onClick={() => onTimerPickerOpenChange(!timerPickerOpen)}
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
                role="option"
                aria-selected={selectedInterval === minutes}
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
      <button
        type="button"
        className="combined-dashboard-link"
        aria-label="Open dashboard"
        title="Open dashboard"
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
  const [nextTimerMinutes, setNextTimerMinutes] = useState<number | null>(
    null,
  );
  const [selectedPulseId, setSelectedPulseId] = useState<number | null>(null);
  const [metricIndex, setMetricIndex] = useState(0);
  const [ratings, setRatings] = useState<Record<string, RatingValue | null>>({});
  const [brainDumpDraft, setBrainDumpDraft] = useBrainDumpDraft();
  const { text: brainDumpText } = brainDumpDraft;
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [schedulingTimer, setSchedulingTimer] = useState(false);
  const [metricDue, setMetricDue] = useState(() => readMetricDueHeld());
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const brainDumpRef = useRef<HTMLTextAreaElement | null>(null);
  const taskListRef = useRef<HTMLDivElement | null>(null);
  const liveTasksRef = useRef<HTMLDivElement | null>(null);
  const stickToLiveRef = useRef(true);
  const isLoaded = loaded !== null;
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
  const recentClosed = recentlyClosedTasks(loaded?.tasks ?? [], nowMs);
  const recentClosedKey = recentClosed.map((task) => task.id).join(",");
  // One drag list spanning both lanes: dropping on a row of the other lane is
  // what moves a task between Active and Up next. An empty lane still offers
  // its placeholder as a drop target.
  const boardRowIds = [
    ...(activeTasks.length
      ? activeTasks.map((task) => task.id)
      : [EMPTY_ACTIVE_ROW]),
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
    Promise.all([listMetrics(), listPulses(), listTasks(), getTimerState()])
      .then(([metrics, pulses, tasks, timer]) => {
        if (cancelled) return;
        const visible = pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id));
        setLoaded({ metrics, pulses, tasks, timer });
        setSelectedPulseId(firstScorablePulse(visible)?.id ?? null);
        setNextTimerMinutes(timer.intervalMinutes);
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
    return subscribeTauriEvent("phase-changed", () => {
      void listTasks().then((tasks) => {
        setLoaded((current) => (current ? { ...current, tasks } : current));
      });
    });
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

  useLayoutEffect(() => {
    if (!stickToLiveRef.current) return;
    const list = taskListRef.current;
    const live = liveTasksRef.current;
    if (list && live) list.scrollTop = live.offsetTop;
  }, [isLoaded, recentClosedKey]);

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
      setNextTimerMinutes(minutes);
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
      setLoaded({
        ...loaded,
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
      setLoaded({
        ...loaded,
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
      setLoaded((current) =>
        current
          ? {
              ...current,
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
      setLoaded((current) => (current ? { ...current, tasks } : current));
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
      setLoaded({
        ...loaded,
        tasks: loaded.tasks.map((task) => byId.get(task.id) ?? task),
      });
      await emit("data-changed");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const addTask = async () => {
    const title = taskTitle.trim();
    if (!loaded || submitting || !title) return;
    setSubmitting(true);
    setError(null);
    try {
      const task = await createTask(title, "", "active");
      setLoaded((current) =>
        current ? { ...current, tasks: [...current.tasks, task] } : current,
      );
      setTaskTitle("");
      setAddingTask(false);
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
    await submitBrainDump(text, null);
    setBrainDumpDraft({ text: "" });
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
        return timerDue
          ? (nextTimerMinutes ?? loaded.timer.intervalMinutes)
          : null;
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

  const workingCount = loaded.tasks.filter((task) => task.workingNow).length;
  // Live lanes share a row: lead play control, title, trailing status
  // actions. Closed history is a quieter restore row, not in the drag list.
  const renderTaskRow = (task: Task) => (
    <li
      className={`now-task${task.workingNow ? " now-task--working" : ""}${
        boardSort.draggingId === task.id ? " is-dragging" : ""
      }${boardSort.overId === task.id ? " is-drop-target" : ""}`}
      key={task.id}
      {...boardSort.rowProps(task.id)}
    >
      <div className="now-task__actions now-task__lead">
        {task.status === "active" ? (
          <WorkingToggle
            task={task}
            playPause
            nowMs={nowMs}
            disabled={submitting}
            onToggle={(working) => updateTaskWorking(task, working)}
          />
        ) : (
          <button
            type="button"
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
      <div
        className="now-card__tasks"
        ref={taskListRef}
        onScroll={() => {
          const list = taskListRef.current;
          const live = liveTasksRef.current;
          if (!list || !live) return;
          stickToLiveRef.current = list.scrollTop >= live.offsetTop - 2;
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
                aria-label="New active task"
                autoComplete="off"
                disabled={submitting}
                placeholder="Add an active task…"
                value={taskTitle}
                onChange={(event) => setTaskTitle(event.target.value)}
                onKeyDown={(event) => {
                  if (event.key === "Enter") {
                    event.preventDefault();
                    void addTask();
                  } else if (event.key === "Escape") {
                    event.preventDefault();
                    event.stopPropagation();
                    setAddingTask(false);
                  }
                }}
              />
              <button
                type="button"
                aria-label="Create task"
                title="Create task"
                disabled={submitting || !taskTitle.trim()}
                onClick={() => void addTask()}
              >
                +
              </button>
            </div>
          )}
          {activeTasks.length === 0 ? (
            <p
              className={`now-card__empty${
                boardSort.overId === EMPTY_ACTIVE_ROW ? " is-drop-target" : ""
              }`}
              {...boardSort.rowProps(EMPTY_ACTIVE_ROW)}
            >
              Nothing active right now.
            </p>
          ) : (
            <ul className="now-list">{activeTasks.map(renderTaskRow)}</ul>
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
        const target = event.target as Element;
        if (timerPickerOpen && !target.closest(".combined-timer__main")) {
          setTimerPickerOpen(false);
        }
      }}
      onWheelCapture={(event) => {
        const list = (event.target as Element).closest(".now-card__tasks");
        if (
          list instanceof HTMLElement &&
          taskListOwnsWheel(event.deltaY, list)
        ) {
          return;
        }
        const current = Number(
          event.currentTarget.style.getPropertyValue("--timer-collapse"),
        );
        event.currentTarget.style.setProperty(
          "--timer-collapse",
          String(Math.min(1, Math.max(0, current + event.deltaY / 300))),
        );
      }}
    >
      <aside className="combined-sidebar">
        <PopupTopPanel
          timerDue={timerDue}
          countdown={countdown}
          remainingRatio={remainingRatio}
          timerPickerOpen={timerPickerOpen}
          schedulingTimer={schedulingTimer}
          selectedInterval={
            nextTimerMinutes ?? loaded.timer.intervalMinutes
          }
          onTimerPickerOpenChange={setTimerPickerOpen}
          onSelectInterval={(minutes) => void applyTimer(minutes)}
          onOpenDashboard={() => void openDashboard()}
        />
        {taskView}
      </aside>

      <main className="combined-workspace">
        <section className="combined-brain-dump" aria-label="Brain dump">
          <textarea
            ref={brainDumpRef}
            id="popup-brain-dump"
            className="combined-input"
            aria-label="Brain dump"
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            spellCheck={false}
            value={brainDumpText}
            onChange={(event) =>
              setBrainDumpDraft({ text: event.target.value })
            }
            onKeyDown={(event) => {
              if (
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
        </section>

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
          {visiblePulses.length > 0 && (
            <div className="popup-pulse-toggle" role="group" aria-label="Pulses">
              {visiblePulses.map((pulse) => (
                <button
                  key={pulse.id}
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
          {activeMetric ? (
            <div
              className="metric-step"
              key={`${selectedPulseId}:${activeMetric.id}`}
              aria-live="polite"
            >
              <div className="metric-step__title">
                <NestIcon
                  name={activeMetric.icon}
                  color={resolveMetricColorFromList(loaded?.metrics ?? [], activeMetric.id)}
                />
                <h2>{activeMetric.name}</h2>
              </div>
              <div
                className="metric-row__buttons"
                role="group"
                aria-label={activeMetric.name}
              >
                {([1, 2, 3, 4, 5] as RatingValue[]).map((value) => {
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

        {error && (
          <div className="popup-workspace__error" role="alert">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}

export default PopupContent;
