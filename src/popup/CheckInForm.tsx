import { useEffect, useRef, useState, type FormEvent } from "react";
import { emit } from "@tauri-apps/api/event";
import {
  getCurrentWebviewWindow,
  WebviewWindow,
} from "@tauri-apps/api/webviewWindow";
import {
  getCheckInSchedule,
  latestPhaseCheckIn,
  listMetrics,
  listPhases,
  listTasks,
  scheduleNextCheckIn,
  setTaskStatus,
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

function CheckInForm() {
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

  const openDashboard = async () => {
    const dashboard = await WebviewWindow.getByLabel("dashboard");
    if (dashboard) {
      await dashboard.show();
      await dashboard.setFocus();
    }
    await getCurrentWebviewWindow().hide();
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

  const submitPrimary = async () => {
    if (!loaded || submitting || step !== "inputs") return;
    setSubmitting(true);
    setError(null);
    try {
      // The interval picker sets the recurring popup's cadence, not a property
      // of this task. Reschedule on every submit so checking in resets the clock.
      await scheduleNextCheckIn(nextCheckInMinutes);

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
      await getCurrentWebviewWindow().hide();
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

  const activeTasks = loaded.tasks.filter((task) => task.status === "active");

  return (
    <form className="combined-checkin" onSubmit={onSubmit}>
      <div className="combined-checkin__scroll">
        <section className="combined-section">
          <div className="combined-section__head">
            <span className="combined-section__kicker">Brain dump</span>
            <div
              className="combined-interval"
              tabIndex={0}
              aria-label="Next check-in interval"
            >
              <button
                type="button"
                className="combined-interval__btn"
                onClick={() =>
                  setNextCheckInMinutes((m) => shiftInterval(m, -1))
                }
                disabled={nextCheckInMinutes <= MIN_INTERVAL_MINUTES}
                aria-label="Decrease interval"
              >
                -
              </button>
              <strong>{nextCheckInMinutes}m</strong>
              <button
                type="button"
                className="combined-interval__btn"
                onClick={() =>
                  setNextCheckInMinutes((m) => shiftInterval(m, 1))
                }
                disabled={nextCheckInMinutes >= MAX_INTERVAL_MINUTES}
                aria-label="Increase interval"
              >
                +
              </button>
            </div>
          </div>
          <textarea
            ref={brainDumpRef}
            className="combined-input"
            value={brainDumpText}
            onChange={(e) => setBrainDumpText(e.target.value)}
            placeholder="Brain dump"
            rows={3}
          />
        </section>

        {step === "inputs" ? (
          <>
            <section className="combined-section">
              <div className="combined-section__head">
                <span className="combined-section__kicker">Active tasks</span>
                <button
                  type="button"
                  className="combined-link"
                  onClick={openDashboard}
                >
                  Dashboard
                </button>
              </div>
              {activeTasks.length === 0 ? (
                <div className="combined-empty">
                  <span>No active tasks.</span>
                  <button type="button" onClick={openDashboard}>
                    Open Dashboard
                  </button>
                </div>
              ) : (
                <div className="active-task-list">
                  {activeTasks.map((task) => (
                    <div className="active-task-row" key={task.id}>
                      <span>{task.title}</span>
                      <div className="active-task-row__actions">
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(task, "paused")}
                          disabled={submitting}
                        >
                          Pause
                        </button>
                        <button
                          type="button"
                          onClick={() => updateTaskStatus(task, "completed")}
                          disabled={submitting}
                        >
                          Complete
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </section>

            <section className="combined-section">
              <div className="combined-section__head">
                <span className="combined-section__kicker">Phase</span>
              </div>
              {loaded.phases.length === 0 ? (
                <div className="combined-empty">
                  <span>No active phases.</span>
                  <button type="button" onClick={openDashboard}>
                    Open Dashboard
                  </button>
                </div>
              ) : (
                <div
                  className="phase-grid"
                  role="radiogroup"
                  aria-label="Current phase"
                >
                  {loaded.phases.map((phase) => (
                    <button
                      key={phase.id}
                      type="button"
                      role="radio"
                      aria-checked={selectedPhaseId === phase.id}
                      className={`phase-choice${
                        selectedPhaseId === phase.id
                          ? " phase-choice--active"
                          : ""
                      }`}
                      onClick={() =>
                        setSelectedPhaseId((current) =>
                          current === phase.id ? null : phase.id,
                        )
                      }
                    >
                      {phase.name}
                    </button>
                  ))}
                </div>
              )}
            </section>
          </>
        ) : (
          <section className="combined-section combined-section--panel">
            <div className="combined-section__head">
              <span className="combined-section__kicker">Metrics</span>
            </div>
            {loaded.metrics.length === 0 ? (
              <div className="combined-empty">
                <span>No active metrics.</span>
                <button type="button" onClick={openDashboard}>
                  Open Dashboard
                </button>
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
                            className={`metric-rating${
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
