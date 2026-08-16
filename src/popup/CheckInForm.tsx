import { useEffect, useRef, useState } from "react";
import { emit, listen } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  createTask,
  getCheckInSchedule,
  listMetrics,
  listPulses,
  listTasks,
  scheduleNextCheckIn,
  setTaskStatus,
  setTaskWorking,
  submitBrainDump,
  submitMetricCheckIn,
} from "../lib/commands";
import type {
  CheckInSchedule,
  Metric,
  MetricRatingInput,
  Pulse,
  RatingValue,
  Task,
} from "../lib/types";
import {
  checkInRemainingSeconds,
  formatCheckInCountdown,
} from "../dashboard/lib/time";
import { groupTasksByStatus } from "../dashboard/lib/tasks";
import {
  isBrainDumpSubmitShortcut,
  trimBrainDumpDraft,
  useBrainDumpDraft,
} from "../lib/brainDumpDraft";
import { readHiddenPulseIds } from "../lib/pulseVisibility";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import { NestIcon } from "../dashboard/components/PulseIcon";
import "./CheckInForm.css";

const CHECK_IN_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

type LoadState = {
  metrics: Metric[];
  pulses: Pulse[];
  tasks: Task[];
  schedule: CheckInSchedule;
};

function PlayIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="m7 5 7.5 5L7 15Z" />
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
          aria-label={
            timerDue
              ? "Check-in due. Start a new timer"
              : `Timer ${countdown}. Start a new timer`
          }
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
            {CHECK_IN_INTERVALS.map((minutes) => (
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

function CheckInForm({
  onDismiss,
  onComplete,
}: {
  onDismiss: () => Promise<void>;
  onComplete: (save: () => Promise<number | null>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [nextCheckInMinutes, setNextCheckInMinutes] = useState<number | null>(
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
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const brainDumpRef = useRef<HTMLTextAreaElement | null>(null);
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

  useEffect(() => {
    let cancelled = false;
    Promise.all([listMetrics(), listPulses(), listTasks(), getCheckInSchedule()])
      .then(([metrics, pulses, tasks, schedule]) => {
        if (cancelled) return;
        const visible = pulses.filter((pulse) => !hiddenPulseIds.has(pulse.id));
        setLoaded({ metrics, pulses, tasks, schedule });
        setSelectedPulseId(firstScorablePulse(visible)?.id ?? null);
        setNextCheckInMinutes(schedule.intervalMinutes);
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
    let cancelled = false;
    let unlisten: (() => void) | undefined;
    void listen("phase-changed", () => {
      void listTasks().then((tasks) => {
        setLoaded((current) => (current ? { ...current, tasks } : current));
      });
    }).then((u) => {
      if (cancelled) u();
      else unlisten = u;
    });
    return () => {
      cancelled = true;
      unlisten?.();
    };
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

  const openDashboard = async () => {
    await onDismiss();
    const dashboard = await WebviewWindow.getByLabel("dashboard");
    if (dashboard) {
      await dashboard.show();
      await dashboard.setFocus();
    }
  };

  const startTimer = async (minutes: number) => {
    if (schedulingTimer) return;
    setSchedulingTimer(true);
    setError(null);
    try {
      const schedule = await scheduleNextCheckIn(minutes);
      setLoaded((current) => (current ? { ...current, schedule } : current));
      setNextCheckInMinutes(minutes);
      setNowMs(Date.now());
      setTimerPickerOpen(false);
      await emit("check-in-submitted");
    } catch (e) {
      setError(String(e));
    } finally {
      setSchedulingTimer(false);
    }
  };

  const updateTaskStatus = async (
    task: Task,
    status: "active" | "completed",
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
      await emit("check-in-submitted");
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
      await emit("check-in-submitted");
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
      await emit("check-in-submitted");
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
    await emit("check-in-submitted");
  };

  const saveBrainDump = async () => {
    const { title, text } = trimBrainDumpDraft(brainDumpDraft);
    if (!text) return;
    await submitBrainDump(text, title);
    setBrainDumpDraft({ title: "", text: "" });
    await emit("check-in-submitted");
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
        await saveBrainDump();
        await saveMetrics(pulse, checkInRatings);
        return timerDue
          ? (nextCheckInMinutes ?? loaded.schedule.intervalMinutes)
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
      <div className="combined-checkin combined-checkin--loading">
        {error ? (
          <div className="combined-checkin__error" role="alert">
            {error}
          </div>
        ) : (
          "Loading..."
        )}
      </div>
    );
  }

  const tasksByStatus = groupTasksByStatus(loaded.tasks);
  const activeTasks = tasksByStatus.active;
  const upNextTasks = tasksByStatus.up_next;
  const taskView = (
    <section className="now-card" aria-label="Tasks">
      <div className="now-card__tasks">
        <section className="now-group" aria-labelledby="popup-active-tasks">
          <header className="now-group__head">
            <h2 id="popup-active-tasks">Active</h2>
            <span>{activeTasks.length}</span>
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
            <p className="now-card__empty">Nothing active right now.</p>
          ) : (
            <ul className="now-list">
              {activeTasks.map((task) => (
                <li
                  className={`now-task${
                    task.workingNow ? " now-task--working" : ""
                  }`}
                  key={task.id}
                >
                  <span className="now-task__title">{task.title}</span>
                  <div className="now-task__actions">
                    <WorkingToggle
                      task={task}
                      playPause
                      nowMs={nowMs}
                      disabled={submitting}
                      onToggle={(working) => updateTaskWorking(task, working)}
                    />
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
              ))}
            </ul>
          )}
        </section>
        {upNextTasks.length > 0 && (
          <section
            className="now-group now-group--up-next"
            aria-labelledby="popup-up-next-tasks"
          >
            <header className="now-group__head">
              <h2 id="popup-up-next-tasks">Up next</h2>
              <span>{upNextTasks.length}</span>
            </header>
            <ul className="now-list">
              {upNextTasks.map((task) => (
                <li className="now-task now-task--up-next" key={task.id}>
                  <span className="now-task__title">{task.title}</span>
                  <div className="now-task__actions">
                    <button
                      type="button"
                      className="now-task__activate"
                      aria-label={`Activate ${task.title}`}
                      title="Move to Active"
                      onClick={() => updateTaskStatus(task, "active")}
                      disabled={submitting}
                    >
                      <PlayIcon />
                    </button>
                  </div>
                </li>
              ))}
            </ul>
          </section>
        )}
      </div>
    </section>
  );

  const timerDue = loaded.schedule.waitingForResponse;
  const countdown = timerDue
    ? "0:00"
    : formatCheckInCountdown(loaded.schedule.nextDueAt, nowMs);
  const remainingRatio = timerDue
    ? 0
    : Math.min(
        1,
        checkInRemainingSeconds(loaded.schedule.nextDueAt, nowMs) /
          (loaded.schedule.intervalMinutes * 60),
      );
  return (
    <div
      className="combined-checkin"
      onPointerDownCapture={(event) => {
        const target = event.target as Element;
        if (timerPickerOpen && !target.closest(".combined-timer__main")) {
          setTimerPickerOpen(false);
        }
      }}
      onWheelCapture={(event) => {
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
            nextCheckInMinutes ?? loaded.schedule.intervalMinutes
          }
          onTimerPickerOpenChange={setTimerPickerOpen}
          onSelectInterval={(minutes) => void startTimer(minutes)}
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
              setBrainDumpDraft((draft) => ({
                ...draft,
                text: event.target.value,
              }))
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
          className="pulse-panel"
          aria-label="Pulse check-in"
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
                <NestIcon name={activeMetric.icon} />
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
          <div className="combined-checkin__error" role="alert">
            {error}
          </div>
        )}
      </main>
    </div>
  );
}

export default CheckInForm;
