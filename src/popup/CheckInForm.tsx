import { useEffect, useRef, useState, type FormEvent } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  createTask,
  getCheckInSchedule,
  latestPhaseCheckIn,
  listMetrics,
  listPhases,
  listTasks,
  scheduleNextCheckIn,
  setTaskStatus,
  setTaskWorking,
  submitMetricCheckIn,
  submitPhaseCheckIn,
  submitPrimaryCheckIn,
} from "../lib/commands";
import type {
  CheckInSchedule,
  Metric,
  MetricRatingInput,
  Phase,
  PhaseCheckIn,
  RatingValue,
  Task,
} from "../lib/types";
import { formatCheckInCountdown } from "../dashboard/lib/time";
import { groupTasksByStatus } from "../dashboard/lib/tasks";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import "./CheckInForm.css";

const CHECK_IN_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

type Step = "inputs" | "metrics";
type LoadState = {
  latestPhase: PhaseCheckIn | null;
  phases: Phase[];
  metrics: Metric[];
  tasks: Task[];
  schedule: CheckInSchedule;
};

function StopIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <rect x="5" y="5" width="10" height="10" rx="2" />
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

function ChevronIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path
        d="M12.5 4.5 7 10l5.5 5.5"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
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

export function PopupTopPanel({
  timerDue,
  countdown,
  timerPickerOpen,
  schedulingTimer,
  selectedInterval,
  phases,
  selectedPhaseId,
  onTimerPickerOpenChange,
  onSelectInterval,
  onShiftPhase,
  onSelectPhase,
  onOpenDashboard,
}: {
  timerDue: boolean;
  countdown: string;
  timerPickerOpen: boolean;
  schedulingTimer: boolean;
  selectedInterval: number;
  phases: Phase[];
  selectedPhaseId: number | null;
  onTimerPickerOpenChange: (open: boolean) => void;
  onSelectInterval: (minutes: number) => void;
  onShiftPhase: (direction: -1 | 1) => void;
  onSelectPhase: (phaseId: number) => void;
  onOpenDashboard: () => void;
}) {
  const currentPhase = phases.find((phase) => phase.id === selectedPhaseId);

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
              ? "Check-in due. Change next check-in interval"
              : `Timer ${countdown}. Start a new timer`
          }
          disabled={schedulingTimer}
          onClick={() => onTimerPickerOpenChange(!timerPickerOpen)}
        >
          <strong className="combined-timer__value" role="timer">
            {countdown}
          </strong>
          <span aria-hidden="true">▾</span>
        </button>
        {timerPickerOpen && (
          <div
            className="combined-timer__picker"
            role="listbox"
            aria-label={timerDue ? "Next check-in interval" : "Start timer"}
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
      <section className="combined-phase">
        {phases.length === 0 ? (
          <div className="combined-empty">No active phases</div>
        ) : (
          <div
            className="phase-stepper"
            role="group"
            aria-label="Current phase"
            tabIndex={0}
            onKeyDown={(event) => {
              switch (event.key) {
                case "ArrowLeft":
                case "ArrowUp":
                  event.preventDefault();
                  onShiftPhase(-1);
                  break;
                case "ArrowRight":
                case "ArrowDown":
                  event.preventDefault();
                  onShiftPhase(1);
                  break;
                case "Home":
                  event.preventDefault();
                  onSelectPhase(phases[0].id);
                  break;
                case "End":
                  event.preventDefault();
                  onSelectPhase(phases[phases.length - 1].id);
                  break;
              }
            }}
          >
            <button
              type="button"
              className="phase-stepper__chevron"
              aria-label="Previous phase"
              tabIndex={-1}
              onClick={() => onShiftPhase(-1)}
            >
              <ChevronIcon />
            </button>
            <div className="phase-stepper__display">
              <span
                className="phase-stepper__name"
                aria-live="polite"
                title={currentPhase?.name}
              >
                {currentPhase ? currentPhase.name : "Pick a phase"}
              </span>
            </div>
            <button
              type="button"
              className="phase-stepper__chevron phase-stepper__chevron--next"
              aria-label="Next phase"
              tabIndex={-1}
              onClick={() => onShiftPhase(1)}
            >
              <ChevronIcon />
            </button>
          </div>
        )}
      </section>
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

function CheckInForm({
  initialStep = "inputs",
  onDismiss,
  onComplete,
}: {
  initialStep?: Step;
  onDismiss: () => Promise<void>;
  onComplete: (minutes: number | null) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [step, setStep] = useState<Step>(initialStep);
  const [nextCheckInMinutes, setNextCheckInMinutes] = useState<number | null>(
    null,
  );
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<number, RatingValue | null>>({});
  const [brainDumpText, setBrainDumpText] = useState("");
  const [taskTitle, setTaskTitle] = useState("");
  const [addingTask, setAddingTask] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [timerPickerOpen, setTimerPickerOpen] = useState(false);
  const [schedulingTimer, setSchedulingTimer] = useState(false);
  const savedPhaseIdRef = useRef<number | null>(null);
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const brainDumpRef = useRef<HTMLTextAreaElement | null>(null);
  const taskInputRef = useRef<HTMLInputElement | null>(null);
  const submitRef = useRef<HTMLButtonElement | null>(null);
  const isLoaded = loaded !== null;

  const focusMetricRow = (idx: number) => {
    rowRefs.current[idx]
      ?.querySelector<HTMLButtonElement>('[role="radio"][tabindex="0"]')
      ?.focus();
  };

  useEffect(() => {
    let cancelled = false;
    Promise.all([
      latestPhaseCheckIn(),
      listPhases(false),
      listMetrics(false),
      listTasks(),
      getCheckInSchedule(),
    ])
      .then(([latestPhase, phases, metrics, tasks, schedule]) => {
        if (cancelled) return;
        setLoaded({ latestPhase, phases, metrics, tasks, schedule });
        setNextCheckInMinutes(schedule.intervalMinutes);
        setSelectedPhaseId(latestPhase?.phaseId ?? null);
        savedPhaseIdRef.current = latestPhase?.phaseId ?? null;
        setRatings(
          Object.fromEntries(metrics.map((metric) => [metric.id, null])),
        );
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
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    if (step === "inputs") {
      requestAnimationFrame(() => brainDumpRef.current?.focus());
    } else {
      requestAnimationFrame(() => focusMetricRow(0));
    }
  }, [step, isLoaded]);

  const focusAfterRow = (idx: number) => {
    if (idx + 1 < (loaded?.metrics.length ?? 0)) {
      focusMetricRow(idx + 1);
    } else {
      submitRef.current?.focus();
    }
  };

  const setRating = (metricId: number, value: RatingValue) => {
    setRatings((prev) => ({ ...prev, [metricId]: value }));
  };

  // Move the phase selection one step in either direction, wrapping around the
  // ends. When nothing is selected yet (no latest phase), a step forward lands
  // on the first phase and a step back lands on the last.
  const shiftPhase = (direction: -1 | 1) => {
    const phases = loaded?.phases ?? [];
    if (phases.length === 0) return;
    const currentIndex = phases.findIndex((p) => p.id === selectedPhaseId);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : phases.length - 1
        : (currentIndex + direction + phases.length) % phases.length;
    setSelectedPhaseId(phases[nextIndex].id);
  };

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

  const selectTimerInterval = (minutes: number) => {
    if (loaded?.schedule.waitingForResponse) {
      setNextCheckInMinutes(minutes);
      setTimerPickerOpen(false);
    } else {
      void startTimer(minutes);
    }
  };

  const updateTaskStatus = async (
    task: Task,
    status: "active" | "paused" | "completed",
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

  const submitPrimary = async () => {
    if (!loaded || submitting || step !== "inputs") return;
    setSubmitting(true);
    setError(null);
    try {
      const schedule = await submitPrimaryCheckIn(
        brainDumpText.trim() || null,
        selectedPhaseId !== loaded.latestPhase?.phaseId ? selectedPhaseId : null,
        timerDue
          ? (nextCheckInMinutes ?? loaded.schedule.intervalMinutes)
          : null,
      );
      setLoaded((current) => (current ? { ...current, schedule } : current));
      savedPhaseIdRef.current = selectedPhaseId;
      setNowMs(Date.now());
      await emit("check-in-submitted");
      setStep("metrics");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
    }
  };

  const submitMetricsStep = async () => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      if (
        selectedPhaseId !== null &&
        selectedPhaseId !== savedPhaseIdRef.current
      ) {
        await submitPhaseCheckIn(selectedPhaseId);
        savedPhaseIdRef.current = selectedPhaseId;
        await emit("check-in-submitted");
      }
      const ratingsInput: MetricRatingInput[] = Object.entries(ratings)
        .filter(([, value]) => value !== null)
        .map(([metricId, value]) => ({
          metricId: Number(metricId),
          value: value as RatingValue,
        }));
      if (ratingsInput.length > 0) {
        await submitMetricCheckIn(ratingsInput);
        await emit("check-in-submitted");
      }
      await onComplete(
        timerDue
          ? (nextCheckInMinutes ?? loaded.schedule.intervalMinutes)
          : null,
      );
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const onSubmit = (e: FormEvent) => {
    e.preventDefault();
    if (step === "inputs") {
      submitPrimary();
    } else {
      submitMetricsStep();
    }
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
                    task.workingNow
                      ? " now-task--working is-working-now"
                      : ""
                  }`}
                  key={task.id}
                >
                  <span className="now-task__title">{task.title}</span>
                  <div className="now-task__actions">
                    <WorkingToggle
                      task={task}
                      compact
                      disabled={submitting}
                      onToggle={(working) => updateTaskWorking(task, working)}
                    />
                    <button
                      type="button"
                      aria-label={`Pause ${task.title}`}
                      title="Pause"
                      onClick={() => updateTaskStatus(task, "paused")}
                      disabled={submitting}
                    >
                      <StopIcon />
                    </button>
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
                      Activate
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

  return (
    <form
      className="combined-checkin"
      onSubmit={onSubmit}
      onKeyDownCapture={(e) => {
        if (step === "metrics" && e.key === "Enter") {
          e.preventDefault();
          e.currentTarget.requestSubmit();
        }
      }}
    >
      <PopupTopPanel
        timerDue={timerDue}
        countdown={countdown}
        timerPickerOpen={timerPickerOpen}
        schedulingTimer={schedulingTimer}
        selectedInterval={
          nextCheckInMinutes ?? loaded.schedule.intervalMinutes
        }
        phases={loaded.phases}
        selectedPhaseId={selectedPhaseId}
        onTimerPickerOpenChange={setTimerPickerOpen}
        onSelectInterval={selectTimerInterval}
        onShiftPhase={shiftPhase}
        onSelectPhase={setSelectedPhaseId}
        onOpenDashboard={() => void openDashboard()}
      />
      <div
        className={`combined-checkin__scroll${
          step === "inputs" ? " combined-checkin__scroll--inputs" : ""
        }`}
      >
        {step === "inputs" ? (
          <>
            {taskView}

            <section className="combined-section combined-section--brain-dump">
              <textarea
                ref={brainDumpRef}
                className="combined-input"
                aria-label="Brain dump"
                placeholder="What’s on your mind?"
                value={brainDumpText}
                onChange={(e) => setBrainDumpText(e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" && !e.shiftKey) {
                    e.preventDefault();
                    void submitPrimary();
                  }
                }}
                rows={3}
              />
            </section>
          </>
        ) : (
          <section className="combined-section combined-section--panel">
              {loaded.metrics.length === 0 ? (
                <div className="combined-empty">
                  <span>No active metrics.</span>
                </div>
              ) : (
                <div className="combined-metrics">
                  {loaded.metrics.map((metric, idx) => {
                    const rating = ratings[metric.id] ?? null;
                    return (
                      <div className="metric-row" key={metric.id}>
                        <span className="metric-row__name">{metric.name}</span>
                        <div
                          ref={(el) => {
                            rowRefs.current[idx] = el;
                          }}
                          className="metric-row__buttons"
                          role="radiogroup"
                          aria-label={metric.name}
                          onKeyDown={(e) => {
                            const key = e.key.toLowerCase();
                            if (key >= "1" && key <= "5") {
                              e.preventDefault();
                              e.stopPropagation();
                              setRating(metric.id, Number(key) as RatingValue);
                              focusAfterRow(idx);
                            } else if (
                              e.key === "ArrowRight" ||
                              e.key === "ArrowDown" ||
                              e.key === "ArrowLeft" ||
                              e.key === "ArrowUp"
                            ) {
                              e.preventDefault();
                              const direction =
                                e.key === "ArrowRight" || e.key === "ArrowDown"
                                  ? 1
                                  : -1;
                              const next = Math.min(
                                5,
                                Math.max(1, (rating ?? 1) + direction),
                              ) as RatingValue;
                              setRating(metric.id, next);
                              requestAnimationFrame(() =>
                                rowRefs.current[idx]
                                  ?.querySelector<HTMLButtonElement>(
                                    `[data-value="${next}"]`,
                                  )
                                  ?.focus(),
                              );
                            }
                          }}
                        >
                          {([1, 2, 3, 4, 5] as RatingValue[]).map((value) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={rating === value}
                              data-value={value}
                              className={`metric-rating metric-rating--v${value}${
                                rating === value ? " metric-rating--active" : ""
                              }`}
                              onClick={() => setRating(metric.id, value)}
                              tabIndex={
                                rating === value || (rating === null && value === 1)
                                  ? 0
                                  : -1
                              }
                            >
                              {value}
                            </button>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              )}
          </section>
        )}
      </div>

      {error && (
        <div className="combined-checkin__error" role="alert">
          {error}
        </div>
      )}
      <button
        ref={submitRef}
        type="submit"
        className="combined-submit"
        disabled={submitting}
      >
        {submitting
          ? "Saving..."
          : step === "inputs"
            ? "Continue"
            : Object.values(ratings).some((value) => value !== null)
              ? "Submit"
              : "Skip"}
      </button>
    </form>
  );
}

export default CheckInForm;
