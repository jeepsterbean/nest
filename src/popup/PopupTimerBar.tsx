import { useEffect, useRef, useState, type RefObject } from "react";
import {
  adjacentTimerInterval,
  formatTimerCountdown,
  isTimerDue,
  TIMER_INTERVALS,
  timerRemainingSeconds,
} from "../lib/timer";
import type { TimerState } from "../lib/types";
import { shouldCloseOverlayOnFocusLeave } from "./overlay";
import "./PopupTimerBar.css";

export function PopupTimerBar({
  timer,
  nowMs,
  timerButtonRef,
  onSelectInterval,
}: {
  timer: TimerState;
  nowMs: number;
  timerButtonRef: RefObject<HTMLButtonElement | null>;
  onSelectInterval: (minutes: number) => Promise<void>;
}) {
  // Due also covers a Rust-side pause the local clock has not reached yet,
  // so the face pins to 0:00 instead of trusting the countdown alone.
  const timerDue = isTimerDue(timer, nowMs);
  const countdown = timerDue
    ? "0:00"
    : formatTimerCountdown(timer.nextDueAt, nowMs);
  /** Remaining share of the current interval, 0–1. Hidden at 0. */
  const remainingRatio = timerDue
    ? 0
    : Math.min(
        1,
        timerRemainingSeconds(timer.nextDueAt, nowMs) /
          (timer.intervalMinutes * 60),
      );
  const selectedInterval = timer.intervalMinutes;
  const anchorRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pendingInterval, setPendingInterval] = useState<number | null>(null);
  const [scheduling, setScheduling] = useState(false);
  const displayedInterval = pendingInterval ?? selectedInterval;

  const close = () => {
    setPendingInterval(null);
    setOpen(false);
  };

  useEffect(() => {
    if (!open) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target;
      if (!(target instanceof Node) || anchorRef.current?.contains(target)) {
        return;
      }
      close();
    };
    document.addEventListener("pointerdown", onPointerDown, true);
    return () => document.removeEventListener("pointerdown", onPointerDown, true);
  }, [open]);

  const moveSelection = (direction: -1 | 1) => {
    setPendingInterval(adjacentTimerInterval(displayedInterval, direction));
    setOpen(true);
  };

  const choose = async (minutes: number) => {
    if (scheduling) return;
    setScheduling(true);
    try {
      await onSelectInterval(minutes);
      close();
    } catch {
      // The Popup surfaces the failed interval update.
    } finally {
      setScheduling(false);
    }
  };

  return (
    <div
      className={timerDue ? "popup-timer popup-timer--due" : "popup-timer"}
      onBlur={(event) => {
        if (
          shouldCloseOverlayOnFocusLeave(
            event.currentTarget,
            event.relatedTarget,
          )
        ) {
          close();
        }
      }}
    >
      {/* The picker positions against the trigger, so it drops just below. */}
      <div className="popup-timer__anchor" ref={anchorRef}>
        <button
          ref={timerButtonRef}
          type="button"
          className="popup-timer__trigger"
          aria-haspopup="listbox"
          aria-expanded={open}
          aria-label={timerDue ? "Timer" : `Timer, ${countdown}`}
          disabled={scheduling}
          onClick={() => setOpen((current) => !current)}
          onKeyDown={(event) => {
            if (event.key === "ArrowDown" || event.key === "ArrowUp") {
              event.preventDefault();
              moveSelection(event.key === "ArrowDown" ? 1 : -1);
            } else if (event.key === "Enter" && pendingInterval !== null) {
              event.preventDefault();
              void choose(pendingInterval);
            } else if (event.key === "Escape") {
              event.preventDefault();
              close();
            }
          }}
        >
          <strong className="popup-timer__value" role="timer">
            {countdown}
          </strong>
          <span className="popup-timer__interval">{selectedInterval} min</span>
        </button>
        {open && (
          <div
            className="popup-timer__picker"
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
                disabled={scheduling}
                onMouseDown={(event) => event.preventDefault()}
                onClick={() => void choose(minutes)}
              >
                {minutes} min
              </button>
            ))}
          </div>
        )}
      </div>
      <span className="popup-timer__track" aria-hidden="true">
        {remainingRatio > 0 && (
          <span
            className="popup-timer__sweep"
            style={{ transform: `scaleX(${remainingRatio})` }}
          />
        )}
      </span>
    </div>
  );
}
