import { useEffect, useRef, useState, type FormEvent } from "react";
import { emit } from "@tauri-apps/api/event";
import { WebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  getCheckInSchedule,
  latestPhaseCheckIn,
  listMetrics,
  listPhases,
  listTasks,
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
  PhaseCheckIn,
  RatingValue,
  Task,
} from "../lib/types";
import { formatCheckInCountdown } from "../dashboard/lib/time";
import { WorkingToggle } from "../dashboard/task/TaskWorkingControl";
import "./CheckInForm.css";

const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 30;
const INTERVAL_STEP_MINUTES = 5;

type Step = "inputs" | "metrics";
type LoadState = {
  latestPhase: PhaseCheckIn | null;
  phases: Phase[];
  metrics: Metric[];
  tasks: Task[];
  schedule: CheckInSchedule;
};

const normalizeInterval = (minutes: number) => {
  const stepped =
    Math.round(minutes / INTERVAL_STEP_MINUTES) * INTERVAL_STEP_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, stepped));
};

const shiftInterval = (minutes: number, direction: -1 | 1) =>
  normalizeInterval(minutes + direction * INTERVAL_STEP_MINUTES);

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

function CheckInForm({
  timerTriggered,
  onDismiss,
  onComplete,
}: {
  timerTriggered: boolean;
  onDismiss: () => Promise<void>;
  onComplete: (minutes: number) => Promise<void>;
}) {
  const [loaded, setLoaded] = useState<LoadState | null>(null);
  const [step, setStep] = useState<Step>("inputs");
  const [nextCheckInMinutes, setNextCheckInMinutes] = useState(
    DEFAULT_INTERVAL_MINUTES,
  );
  const [selectedPhaseId, setSelectedPhaseId] = useState<number | null>(null);
  const [ratings, setRatings] = useState<Record<number, RatingValue | null>>({});
  const [brainDumpText, setBrainDumpText] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [nowMs, setNowMs] = useState(() => Date.now());
  const rowRefs = useRef<Array<HTMLDivElement | null>>([]);
  const brainDumpRef = useRef<HTMLTextAreaElement | null>(null);

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
        setNextCheckInMinutes(normalizeInterval(schedule.intervalMinutes));
        setSelectedPhaseId(latestPhase?.phaseId ?? null);
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
    }
  }, [step]);

  const focusAfterRow = (idx: number) => {
    const next = rowRefs.current[idx + 1];
    if (next) next.focus();
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

  const updateTaskStatus = async (
    task: Task,
    status: "paused" | "completed",
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

  const submitPrimary = async () => {
    if (!loaded || submitting || step !== "inputs") return;
    setSubmitting(true);
    setError(null);
    try {
      const dump = brainDumpText.trim();
      if (dump) {
        await submitBrainDump(dump);
      }

      if (
        selectedPhaseId !== null &&
        selectedPhaseId !== loaded.latestPhase?.phaseId
      ) {
        await submitPhaseCheckIn(selectedPhaseId);
      }

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
      await onComplete(nextCheckInMinutes);
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
        {error ? <div className="combined-checkin__error">{error}</div> : "Loading..."}
      </div>
    );
  }

  const activeTasks = loaded.tasks
    .filter((task) => task.status === "active")
    .sort(
      (a, b) =>
        Number(b.workingNow) - Number(a.workingNow) ||
        b.updatedAt - a.updatedAt ||
        b.id - a.id,
    );
  const activeTaskView = (
    <section className="now-card">
      <div className="now-card__head">
        <span className="now-card__kicker">
          <span className="now-dot" aria-hidden="true" />
          Active tasks
        </span>
      </div>
      {activeTasks.length === 0 ? (
        <p className="now-card__empty">
          Nothing active right now. Open the dashboard to pick something up.
        </p>
      ) : (
        <ul className="now-list">
          {activeTasks.map((task) => (
            <li
              className={`now-task${task.workingNow ? " now-task--working" : ""}`}
              key={task.id}
            >
              <span className="now-task__title">
                {task.title}
                {task.workingNow && (
                  <span className="now-task__working-label">Working now</span>
                )}
              </span>
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
  );

  const currentPhaseIndex = loaded.phases.findIndex(
    (p) => p.id === selectedPhaseId,
  );
  const currentPhase =
    currentPhaseIndex === -1 ? null : loaded.phases[currentPhaseIndex];
  const countdown = timerTriggered
    ? "0:00"
    : formatCheckInCountdown(loaded.schedule.nextDueAt, nowMs);

  return (
    <form className="combined-checkin" onSubmit={onSubmit}>
      <section className="combined-timer">
        <div>
          {timerTriggered && (
            <span className="combined-timer__label">Check-in due</span>
          )}
          <strong
            className="combined-timer__value"
            role="timer"
            aria-label={timerTriggered ? "Check-in due" : `Timer ${countdown}`}
          >
            {countdown}
          </strong>
          <button
            type="button"
            className="combined-dashboard-link"
            onClick={openDashboard}
          >
            Dashboard
          </button>
        </div>
        {timerTriggered && (
          <div className="combined-timer__interval">
            <div className="combined-interval" aria-label="Interval">
              <button
                type="button"
                className="combined-interval__btn"
                onClick={() =>
                  setNextCheckInMinutes((minutes) =>
                    shiftInterval(minutes, -1),
                  )
                }
                disabled={nextCheckInMinutes <= MIN_INTERVAL_MINUTES}
                aria-label="Decrease interval"
              >
                −
              </button>
              <strong>{nextCheckInMinutes}m</strong>
              <button
                type="button"
                className="combined-interval__btn"
                onClick={() =>
                  setNextCheckInMinutes((minutes) => shiftInterval(minutes, 1))
                }
                disabled={nextCheckInMinutes >= MAX_INTERVAL_MINUTES}
                aria-label="Increase interval"
              >
                +
              </button>
            </div>
          </div>
        )}
      </section>
      <div className="combined-checkin__scroll">
        {step === "inputs" ? (
          <>
            {activeTaskView}

            <section className="combined-section">
              <div className="combined-section__head">
                <span className="combined-section__kicker">Brain dump</span>
              </div>
              <textarea
                ref={brainDumpRef}
                className="combined-input"
                value={brainDumpText}
                onChange={(e) => setBrainDumpText(e.target.value)}
                rows={3}
              />
            </section>

            <section className="combined-section">
              <div className="combined-section__head">
                <span className="combined-section__kicker">Phase</span>
                {loaded.phases.length > 0 && (
                  <span className="phase-stepper__hint" aria-hidden="true">
                    ← → switch
                  </span>
                )}
              </div>
              {loaded.phases.length === 0 ? (
                <div className="combined-empty">
                  <span>No active phases.</span>
                </div>
              ) : (
                <div
                  className="phase-stepper"
                  role="radiogroup"
                  aria-label="Current phase"
                  tabIndex={0}
                  onKeyDown={(e) => {
                    switch (e.key) {
                      case "ArrowLeft":
                      case "ArrowUp":
                        e.preventDefault();
                        shiftPhase(-1);
                        break;
                      case "ArrowRight":
                      case "ArrowDown":
                        e.preventDefault();
                        shiftPhase(1);
                        break;
                      case "Home":
                        e.preventDefault();
                        setSelectedPhaseId(loaded.phases[0].id);
                        break;
                      case "End":
                        e.preventDefault();
                        setSelectedPhaseId(
                          loaded.phases[loaded.phases.length - 1].id,
                        );
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
                      {currentPhase ? currentPhase.name : "Pick a phase"}
                    </span>
                    <div className="phase-stepper__dots" aria-hidden="true">
                      {loaded.phases.map((phase, i) => (
                        <span
                          key={phase.id}
                          className={`phase-dot${
                            i === currentPhaseIndex ? " phase-dot--active" : ""
                          }`}
                        />
                      ))}
                    </div>
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
            </section>
          </>
        ) : (
          <>
            {activeTaskView}

            <section className="combined-section combined-section--panel">
              <div className="combined-section__head">
                <span className="combined-section__kicker">Metrics</span>
              </div>
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
                          tabIndex={0}
                          onKeyDown={(e) => {
                            const key = e.key.toLowerCase();
                            if (key >= "1" && key <= "5") {
                              e.preventDefault();
                              e.stopPropagation();
                              setRating(metric.id, Number(key) as RatingValue);
                              focusAfterRow(idx);
                            }
                          }}
                        >
                          {([1, 2, 3, 4, 5] as RatingValue[]).map((value) => (
                            <button
                              key={value}
                              type="button"
                              role="radio"
                              aria-checked={rating === value}
                              className={`metric-rating metric-rating--v${value}${
                                rating === value ? " metric-rating--active" : ""
                              }`}
                              onClick={() => setRating(metric.id, value)}
                              tabIndex={-1}
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
          </>
        )}
      </div>

      {error && <div className="combined-checkin__error">{error}</div>}
      <button type="submit" className="combined-submit" disabled={submitting}>
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
