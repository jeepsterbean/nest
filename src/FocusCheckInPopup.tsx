import { useEffect, useMemo, useRef, useState } from "react";
import { getCurrentWebviewWindow } from "@tauri-apps/api/webviewWindow";
import {
  getFocusCheckInSettings,
  latestFocusCheckIn,
  submitFocusCheckIn,
} from "./commands";
import type { FocusCheckIn } from "./types";
import "./FocusCheckInPopup.css";

const DEFAULT_INTERVAL_MINUTES = 30;

type PreviousTaskAnswer = "yes" | "no" | null;

function FocusCheckInPopup() {
  const [previousTaskAnswer, setPreviousTaskAnswer] =
    useState<PreviousTaskAnswer>(null);
  const [currentWork, setCurrentWork] = useState("");
  const [tryingNow, setTryingNow] = useState("");
  const [nextCheckInMinutes, setNextCheckInMinutes] = useState("");
  const [defaultIntervalMinutes, setDefaultIntervalMinutes] = useState(
    DEFAULT_INTERVAL_MINUTES,
  );
  const [previousCheckIn, setPreviousCheckIn] = useState<FocusCheckIn | null>(
    null,
  );
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const yesRef = useRef<HTMLButtonElement | null>(null);
  const tryingNowRef = useRef<HTMLTextAreaElement | null>(null);

  useEffect(() => {
    Promise.all([getFocusCheckInSettings(), latestFocusCheckIn()])
      .then(([settings, latest]) => {
        setDefaultIntervalMinutes(settings.intervalMinutes);
        setPreviousCheckIn(latest);
      })
      .catch((e) => setError(String(e)));
  }, []);

  useEffect(() => {
    if (previousTaskAnswer !== null) tryingNowRef.current?.focus();
  }, [previousTaskAnswer]);

  const parsedNextCheckInMinutes = useMemo(() => {
    const trimmed = nextCheckInMinutes.trim();
    if (!trimmed) return null;
    const parsed = Number(trimmed);
    return Number.isFinite(parsed) ? Math.round(parsed) : Number.NaN;
  }, [nextCheckInMinutes]);

  const needsCurrentWork = previousTaskAnswer === "no";
  const canContinuePreviousTask =
    previousTaskAnswer !== "yes" || previousCheckIn !== null;
  const canSubmit =
    previousTaskAnswer !== null &&
    canContinuePreviousTask &&
    tryingNow.trim().length > 0 &&
    (!needsCurrentWork || currentWork.trim().length > 0) &&
    (parsedNextCheckInMinutes === null ||
      (parsedNextCheckInMinutes >= 1 && parsedNextCheckInMinutes <= 1440));

  const submit = async () => {
    if (!canSubmit || submitting || previousTaskAnswer === null) return;
    setSubmitting(true);
    setError(null);
    try {
      await submitFocusCheckIn(
        previousTaskAnswer === "yes",
        needsCurrentWork ? currentWork.trim() : null,
        tryingNow.trim(),
        parsedNextCheckInMinutes,
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
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.shiftKey && canSubmit) {
              e.preventDefault();
              submit();
            }
          }}
          rows={2}
          placeholder="The next concrete move…"
        />
      </label>

      <label className="focus-popup__field focus-popup__field--inline">
        <span>Next check-in</span>
        <div className="focus-popup__interval">
          <input
            className="focus-popup__minutes"
            inputMode="numeric"
            type="number"
            min="1"
            max="1440"
            value={nextCheckInMinutes}
            onChange={(e) => setNextCheckInMinutes(e.target.value)}
            placeholder={String(defaultIntervalMinutes)}
          />
          <span>minutes</span>
        </div>
      </label>
      <p className="focus-popup__hint">
        Leave blank to check in again in {defaultIntervalMinutes} minutes.
      </p>

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
