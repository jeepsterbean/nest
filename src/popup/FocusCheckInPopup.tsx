import { useEffect, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import { latestFocusCheckIn, submitFocusCheckIn } from "../lib/commands";
import type { FocusCheckIn } from "../lib/types";
import "./FocusCheckInPopup.css";

const DEFAULT_INTERVAL_MINUTES = 15;
const MIN_INTERVAL_MINUTES = 5;
const MAX_INTERVAL_MINUTES = 30;
const INTERVAL_STEP_MINUTES = 5;

type PreviousTaskAnswer = "yes" | "no" | null;

const normalizeInterval = (minutes: number) => {
  const stepped = Math.round(minutes / INTERVAL_STEP_MINUTES) * INTERVAL_STEP_MINUTES;
  return Math.min(MAX_INTERVAL_MINUTES, Math.max(MIN_INTERVAL_MINUTES, stepped));
};

const shiftInterval = (minutes: number, direction: -1 | 1) =>
  normalizeInterval(minutes + direction * INTERVAL_STEP_MINUTES);

function FocusCheckInPopup() {
  const [previousTaskAnswer, setPreviousTaskAnswer] =
    useState<PreviousTaskAnswer>(null);
  const [currentWork, setCurrentWork] = useState("");
  const [tryingNow, setTryingNow] = useState("");
  const [nextCheckInMinutes, setNextCheckInMinutes] = useState(
    DEFAULT_INTERVAL_MINUTES,
  );
  const [previousCheckIn, setPreviousCheckIn] = useState<FocusCheckIn | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const currentWorkRef = useRef<HTMLTextAreaElement | null>(null);
  const tryingNowRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    latestFocusCheckIn()
      .then((latest) => {
        setPreviousCheckIn(latest);
        if (latest) setNextCheckInMinutes(normalizeInterval(latest.nextCheckInMinutes));
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (previousTaskAnswer === "no") {
      currentWorkRef.current?.focus();
    } else if (previousTaskAnswer === "yes") {
      tryingNowRef.current?.focus();
    }
  }, [previousTaskAnswer]);

  const needsCurrentWork = previousTaskAnswer === "no";
  const canContinuePreviousTask =
    previousTaskAnswer !== "yes" || previousCheckIn !== null;
  const canSubmit =
    previousTaskAnswer !== null &&
    canContinuePreviousTask &&
    tryingNow.trim().length > 0 &&
    (!needsCurrentWork || currentWork.trim().length > 0);

  const submit = async () => {
    if (!canSubmit || submitting || previousTaskAnswer === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFocusCheckIn(
        previousTaskAnswer === "yes",
        needsCurrentWork ? currentWork.trim() : null,
        tryingNow.trim(),
        nextCheckInMinutes,
      );
      await getCurrentWebviewWindow().hide();
    } catch (e) {
      setError(String(e));
      setSubmitting(false);
    }
  };

  return (
    <form
      className="focus-popup"
      onSubmit={(e) => {
        e.preventDefault();
        submit();
      }}
      onKeyDown={(e) => {
        if (e.key === "Enter" && !e.shiftKey) {
          e.preventDefault();
          if (canSubmit) submit();
        }
      }}
    >
      {previousCheckIn && (
        <section className="focus-popup__previous" aria-label="Previous focus check-in">
          <div className="focus-popup__previous-head">
            <span>Last focus check-in</span>
          </div>
          <dl className="focus-popup__previous-list">
            <div>
              <dt>Task</dt>
              <dd>{previousCheckIn.task}</dd>
            </div>
            <div>
              <dt>Trying</dt>
              <dd>{previousCheckIn.tryingNow}</dd>
            </div>
          </dl>
        </section>
      )}

      <section className="focus-popup__section">
        <p className="focus-popup__kicker">0</p>
        <h2 className="focus-popup__question">
          Are you still working on the previous task?
        </h2>
        <div
          className="focus-popup__choices"
          onKeyDown={(e) => {
            const key = e.key.toLowerCase();
            if (key === "y" || key === "arrowleft" || key === "a") {
              e.preventDefault();
              e.stopPropagation();
              if (previousCheckIn !== null) setPreviousTaskAnswer("yes");
            } else if (key === "n" || key === "arrowright" || key === "d") {
              e.preventDefault();
              e.stopPropagation();
              setPreviousTaskAnswer("no");
            }
          }}
        >
          <button
            ref={yesRef}
            type="button"
            className={`focus-popup__choice${previousTaskAnswer === "yes" ? " focus-popup__choice--active" : ""}`}
            onClick={() => setPreviousTaskAnswer("yes")}
            disabled={submitting || previousCheckIn === null}
          >
            Yes
          </button>
          <button
            type="button"
            className={`focus-popup__choice${previousTaskAnswer === "no" ? " focus-popup__choice--active" : ""}`}
            onClick={() => setPreviousTaskAnswer("no")}
            disabled={submitting}
          >
            No
          </button>
        </div>
      </section>

      {needsCurrentWork && (
        <label className="focus-popup__field">
          <span>1. What are you currently working on?</span>
          <textarea
            ref={currentWorkRef}
            className="focus-popup__input"
            value={currentWork}
            onChange={(e) => setCurrentWork(e.target.value)}
            rows={2}
            placeholder="Name the task you switched to…"
          />
        </label>
      )}

      <label className="focus-popup__field">
        <span>{needsCurrentWork ? "2" : "1"}. What are you trying now?</span>
        <textarea
          ref={tryingNowRef}
          className="focus-popup__input"
          value={tryingNow}
          onChange={(e) => setTryingNow(e.target.value)}
          rows={2}
          placeholder="The next concrete move…"
        />
      </label>

      <label className="focus-popup__field focus-popup__field--inline">
        <span>Next check-in</span>
        <div
          className="focus-popup__interval"
          role="spinbutton"
          aria-label="Minutes until next check-in"
          aria-valuemin={MIN_INTERVAL_MINUTES}
          aria-valuemax={MAX_INTERVAL_MINUTES}
          aria-valuenow={nextCheckInMinutes}
          tabIndex={0}
          onKeyDown={(e) => {
            const key = e.key.toLowerCase();
            if (key === "arrowleft" || key === "a") {
              e.preventDefault();
              setNextCheckInMinutes((minutes) => shiftInterval(minutes, -1));
            } else if (key === "arrowright" || key === "d") {
              e.preventDefault();
              setNextCheckInMinutes((minutes) => shiftInterval(minutes, 1));
            }
          }}
        >
          <button
            type="button"
            className="focus-popup__interval-btn"
            onClick={() => setNextCheckInMinutes((minutes) => shiftInterval(minutes, -1))}
            disabled={nextCheckInMinutes === MIN_INTERVAL_MINUTES || submitting}
            tabIndex={-1}
            aria-label="Decrease next check-in by 5 minutes"
          >
            −
          </button>
          <strong>{nextCheckInMinutes} min</strong>
          <button
            type="button"
            className="focus-popup__interval-btn"
            onClick={() => setNextCheckInMinutes((minutes) => shiftInterval(minutes, 1))}
            disabled={nextCheckInMinutes === MAX_INTERVAL_MINUTES || submitting}
            tabIndex={-1}
            aria-label="Increase next check-in by 5 minutes"
          >
            +
          </button>
        </div>
      </label>
      {error && <div className="focus-popup__error">{error}</div>}
      <button
        type="submit"
        className="focus-popup__submit"
        disabled={!canSubmit || submitting}
      >
        {submitting ? "Saving…" : "Save focus check-in"}
      </button>
    </form>
  );
}

export default FocusCheckInPopup;
