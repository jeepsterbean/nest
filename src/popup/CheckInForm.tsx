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
  submitBrainDump,
  submitMetricCheckIn,
  submitPhaseCheckIn,
} from "../lib/commands";
import type {
  CheckInSchedule,
  Metric,
  MetricRatingInput,
  Phase,
  RatingValue,
  Task,
} from "../lib/types";
import {
  checkInRemainingSeconds,
  formatCheckInCountdown,
} from "../dashboard/lib/time";
import { groupTasksByStatus } from "../dashboard/lib/tasks";
import {
  WorkedTime,
  WorkingToggle,
} from "../dashboard/task/TaskWorkingControl";
import "./CheckInForm.css";

const CHECK_IN_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

type View = "phase" | "metrics";
type LoadState = {
  phases: Phase[];
  metrics: Metric[];
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

function CheckInForm({
  onDismiss,
  onComplete,
}: {
  onDismiss: () => Promise<void>;
  onComplete: (save: () => Promise<number | null>) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [view, setView] = useState<View>("phase");
  const [phaseConfirmed, setPhaseConfirmed] = useState(false);
  const [phaseTouched, setPhaseTouched] = useState(false);
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
  const phaseStepperRef = useRef<HTMLDivElement | null>(null);
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
      latestPhaseCheckIn(false),
      listPhases(true),
      listMetrics(false),
      listTasks(),
      getCheckInSchedule(),
    ])
      .then(([latestPhase, previousPhase, phases, metrics, tasks, schedule]) => {
        if (cancelled) return;
        setLoaded({ phases, metrics, tasks, schedule });
        setNextCheckInMinutes(schedule.intervalMinutes);
        const defaultPhaseId =
          phases.some(
            (phase) =>
              phase.id === previousPhase?.phaseId && phase.inactiveSince === null,
          )
            ? previousPhase?.phaseId ?? null
            : phases.find((phase) => phase.inactiveSince === null)?.id ?? null;
        setSelectedPhaseId(defaultPhaseId);
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
    if (view === "phase") {
      requestAnimationFrame(() => phaseStepperRef.current?.focus());
    } else {
      requestAnimationFrame(() => focusMetricRow(0));
    }
  }, [view, isLoaded]);

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
    const phases =
      loaded?.phases.filter((phase) => phase.inactiveSince === null) ?? [];
    if (phases.length === 0) return;
    const currentIndex = phases.findIndex((p) => p.id === selectedPhaseId);
    const nextIndex =
      currentIndex === -1
        ? direction === 1
          ? 0
          : phases.length - 1
        : (currentIndex + direction + phases.length) % phases.length;
    selectPhase(phases[nextIndex].id);
  };

  const selectPhase = (phaseId: number) => {
    setSelectedPhaseId(phaseId);
    setPhaseConfirmed(false);
    setPhaseTouched(true);
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

  const savePhase = async (skipped: boolean) => {
    if (phaseConfirmed) return;
    const phaseId = skipped && !phaseTouched ? null : selectedPhaseId;
    if (phaseId !== savedPhaseIdRef.current) {
      await submitPhaseCheckIn(phaseId);
      savedPhaseIdRef.current = phaseId;
      await emit("check-in-submitted");
    }
    setPhaseConfirmed(true);
    setPhaseTouched(false);
  };

  const saveMetrics = async () => {
    const ratingsInput: MetricRatingInput[] = Object.entries(ratings)
      .filter(([, value]) => value !== null)
      .map(([metricId, value]) => ({
        metricId: Number(metricId),
        value: value as RatingValue,
      }));
    if (ratingsInput.length === 0) return;
    await submitMetricCheckIn(ratingsInput);
    setRatings(
      Object.fromEntries(loaded?.metrics.map((metric) => [metric.id, null]) ?? []),
    );
    await emit("check-in-submitted");
  };

  const saveBrainDump = async () => {
    const text = brainDumpText.trim();
    if (!text) return;
    await submitBrainDump(text);
    setBrainDumpText("");
    await emit("check-in-submitted");
  };

  const completePopup = async () => {
    if (!loaded || submitting) return;
    setSubmitting(true);
    setError(null);
    try {
      await onComplete(async () => {
        if (view === "phase") await savePhase(false);
        else await saveMetrics();
        await saveBrainDump();
        return timerDue
          ? (nextCheckInMinutes ?? loaded.schedule.intervalMinutes)
          : null;
      });
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  const selectView = async (next: View) => {
    if (!loaded || submitting || next === view) return;
    if (view === "phase" && next === "metrics") {
      setSubmitting(true);
      setError(null);
      try {
        await savePhase(true);
        setView(next);
      } catch (e) {
        setError(String(e));
      } finally {
        setSubmitting(false);
      }
      return;
    }
    setView(next);
  };

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    if (!loaded || submitting) return;
    if (view === "metrics") {
      await completePopup();
      return;
    }
    setSubmitting(true);
    setError(null);
    try {
      await savePhase(false);
      setView("metrics");
    } catch (e) {
      setError(String(e));
    } finally {
      setSubmitting(false);
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
                    task.workingNow
                      ? " now-task--working is-working-now"
                      : ""
                  }`}
                  key={task.id}
                >
                  <span className="now-task__title">{task.title}</span>
                  <div className="now-task__actions">
                    <WorkedTime task={task} nowMs={nowMs} />
                    <WorkingToggle
                      task={task}
                      compact
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
  const activePhases = loaded.phases.filter(
    (phase) => phase.inactiveSince === null,
  );
  const selectedPhase = loaded.phases.find(
    (phase) => phase.id === selectedPhaseId,
  );
  const phaseName = selectedPhase?.name;

  return (
    <form
      className="combined-checkin"
      onSubmit={onSubmit}
      onWheelCapture={(event) => {
        const current = Number(
          event.currentTarget.style.getPropertyValue("--timer-collapse"),
        );
        event.currentTarget.style.setProperty(
          "--timer-collapse",
          String(Math.min(1, Math.max(0, current + event.deltaY / 300))),
        );
      }}
      onKeyDownCapture={(e) => {
        if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
        if (e.shiftKey && e.target instanceof HTMLTextAreaElement) return;
        if (e.target === taskInputRef.current && !e.altKey) return;
        e.preventDefault();
        if (e.altKey) void completePopup();
        else e.currentTarget.requestSubmit();
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
        <nav className="combined-tabs" role="tablist" aria-label="Check-in view">
          {(["phase", "metrics"] as View[]).map((candidate) => (
            <button
              key={candidate}
              type="button"
              role="tab"
              aria-selected={view === candidate}
              disabled={submitting}
              onClick={() => void selectView(candidate)}
            >
              {candidate === "phase" ? "Phase" : "Metrics"}
            </button>
          ))}
        </nav>

        <section className="combined-workspace__view" role="tabpanel">
          {view === "phase" ? (
            <div className="phase-view">
              {activePhases.length === 0 ? (
                <div className="combined-empty">No active phases</div>
              ) : (
                <div
                  ref={phaseStepperRef}
                  className="phase-stepper"
                  role="group"
                  aria-label="Current phase"
                  tabIndex={0}
                  onKeyDown={(event) => {
                    switch (event.key) {
                      case "ArrowLeft":
                      case "ArrowUp":
                        event.preventDefault();
                        shiftPhase(-1);
                        break;
                      case "ArrowRight":
                      case "ArrowDown":
                        event.preventDefault();
                        shiftPhase(1);
                        break;
                      case "Home":
                        event.preventDefault();
                        selectPhase(activePhases[0].id);
                        break;
                      case "End":
                        event.preventDefault();
                        selectPhase(activePhases[activePhases.length - 1].id);
                        break;
                    }
                  }}
                >
                  <button
                    type="button"
                    className="phase-stepper__chevron"
                    aria-label="Previous phase"
                    tabIndex={-1}
                    onClick={() => shiftPhase(-1)}
                  >
                    <ChevronIcon />
                  </button>
                  <div className="phase-stepper__display">
                    <span className="phase-stepper__name" aria-live="polite">
                      {phaseName}
                    </span>
                  </div>
                  <button
                    type="button"
                    className="phase-stepper__chevron phase-stepper__chevron--next"
                    aria-label="Next phase"
                    tabIndex={-1}
                    onClick={() => shiftPhase(1)}
                  >
                    <ChevronIcon />
                  </button>
                </div>
              )}
            </div>
          ) : loaded.metrics.length === 0 ? (
            <div className="combined-empty">No active metrics.</div>
          ) : (
            <div className="combined-metrics">
              {loaded.metrics.map((metric, idx) => {
                const rating = ratings[metric.id] ?? null;
                return (
                  <div className="metric-row" key={metric.id}>
                    <span className="metric-row__name">{metric.name}</span>
                    <div
                      ref={(element) => {
                        rowRefs.current[idx] = element;
                      }}
                      className="metric-row__buttons"
                      role="radiogroup"
                      aria-label={metric.name}
                      onKeyDown={(event) => {
                        const key = event.key.toLowerCase();
                        if (key >= "1" && key <= "5") {
                          event.preventDefault();
                          event.stopPropagation();
                          setRating(metric.id, Number(key) as RatingValue);
                          focusAfterRow(idx);
                        } else if (
                          ["ArrowRight", "ArrowDown", "ArrowLeft", "ArrowUp"].includes(
                            event.key,
                          )
                        ) {
                          event.preventDefault();
                          const direction = ["ArrowRight", "ArrowDown"].includes(
                            event.key,
                          )
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

        <section className="combined-brain-dump">
          <textarea
            id="popup-brain-dump"
            className="combined-input"
            aria-label="Brain dump"
            placeholder="What’s on your mind?"
            value={brainDumpText}
            onChange={(event) => setBrainDumpText(event.target.value)}
            rows={3}
          />
          <button
            ref={submitRef}
            type="submit"
            className={`combined-submit${view === "phase" ? " combined-submit--next" : ""}`}
            aria-label={
              submitting ? "Saving" : view === "phase" ? "Next" : "Finish"
            }
            aria-busy={submitting}
            disabled={submitting}
          >
            {view === "phase" ? <ChevronIcon /> : <CheckIcon />}
          </button>
        </section>

        {error && (
          <div className="combined-checkin__error" role="alert">
            {error}
          </div>
        )}
      </main>
    </form>
  );
}

export default CheckInForm;
