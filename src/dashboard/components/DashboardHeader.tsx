import { useEffect, useMemo, useRef, useState } from "react";
import { listReminders, startTimer } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  advanceTypewriter,
  INITIAL_TYPEWRITER_FRAME,
  TYPEWRITER_CYCLE_MS,
} from "../lib/typewriter";
import { formatTimerCountdown, greetingForHour, TIMER_INTERVALS, isTimerDue } from "../lib/time";
import { phaseIconName, phaseName } from "../lib/period";
import { NestIcon } from "./PulseIcon";
import {
  calendarIcon,
  chevronDownIcon,
  clockIcon,
  insightsIcon,
  logsIcon,
  metricsIcon,
  overviewIcon,
  tasksIcon,
} from "./icons";

export type DashboardView =
  | "overview"
  | "calendar"
  | "insights"
  | "logs"
  | "tasks"
  | "metrics";

const VIEWS = [
  { key: "overview", label: "Overview", icon: overviewIcon },
  { key: "calendar", label: "Calendar", icon: calendarIcon },
  { key: "insights", label: "Insights", icon: insightsIcon },
  { key: "logs", label: "Logs", icon: logsIcon },
  { key: "tasks", label: "Tasks", icon: tasksIcon },
  { key: "metrics", label: "Metrics", icon: metricsIcon },
] as const;

export function DashboardSidebar({
  view,
  onSelectView,
}: {
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
}) {
  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Dashboard sections">
        {VIEWS.map((item) => (
          <button
            key={item.key}
            type="button"
            className={
              view === item.key
                ? "dash-nav__btn dash-nav__btn--active"
                : "dash-nav__btn"
            }
            aria-label={item.label}
            aria-current={view === item.key ? "page" : undefined}
            onClick={() => onSelectView(item.key)}
          >
            <span className="dash-nav__icon">{item.icon}</span>
            <span className="dash-nav__label">{item.label}</span>
          </button>
        ))}
      </nav>
    </aside>
  );
}

export function DashboardHeader() {
  const {
    timerState,
    phases,
    latestPhase,
    mutate,
    setError,
  } = useDashboardData();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [reminders, setReminders] = useState<string[]>([]);
  const [typewriter, setTypewriter] = useState(INITIAL_TYPEWRITER_FRAME);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timerWrapRef = useRef<HTMLDivElement | null>(null);
  const now = new Date(nowMs);
  const greeting = greetingForHour(now.getHours());
  const messages = useMemo(
    () => [`${greeting}.`, ...reminders],
    [greeting, reminders],
  );
  const message = messages[typewriter.messageIndex % messages.length];
  const visibleMessage = reducedMotion
    ? message
    : message.slice(0, typewriter.characterIndex);
  const countdown = timerState
    ? formatTimerCountdown(timerState.nextDueAt, nowMs)
    : "—:—";
  const timerDue =
    timerState !== null && isTimerDue(timerState, nowMs);
  const timerLabel = timerDue ? "time to check in!" : countdown;

  const currentPhaseName = latestPhase
    ? phaseName(latestPhase.phaseId, phases, latestPhase.phaseLabel)
    : null;
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  useEffect(() => {
    let cancelled = false;
    void listReminders()
      .then((items) => {
        if (!cancelled) setReminders(items);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      });
    return () => {
      cancelled = true;
    };
  }, [setError]);

  useEffect(() => {
    const query = window.matchMedia("(prefers-reduced-motion: reduce)");
    const onChange = () => {
      setReducedMotion(query.matches);
      setTypewriter(INITIAL_TYPEWRITER_FRAME);
    };
    query.addEventListener("change", onChange);
    return () => query.removeEventListener("change", onChange);
  }, []);

  useEffect(() => {
    if (reducedMotion) {
      const timeout = window.setTimeout(
        () =>
          setTypewriter({
            messageIndex: (typewriter.messageIndex + 1) % messages.length,
            characterIndex: 0,
            deleting: false,
          }),
        TYPEWRITER_CYCLE_MS,
      );
      return () => window.clearTimeout(timeout);
    }

    const next = advanceTypewriter(
      typewriter,
      message.length,
      messages.length,
    );
    const timeout = window.setTimeout(
      () => setTypewriter(next.frame),
      next.delay,
    );
    return () => window.clearTimeout(timeout);
  }, [message.length, messages.length, reducedMotion, typewriter]);

  useEffect(() => {
    if (!pickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        pickerOpen &&
        timerWrapRef.current &&
        !timerWrapRef.current.contains(target)
      ) {
        setPickerOpen(false);
      }
    };
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen]);

  const selectInterval = async (minutes: number) => {
    setPickerOpen(false);
    if (scheduling) return;
    setScheduling(true);
    await mutate(() => startTimer(minutes));
    setScheduling(false);
  };

  const phaseLabel = currentPhaseName ?? "No phase yet";

  return (
    <header className="dash-header">
      <div className="dash-header__intro">
        <h1 className="dash-header__greeting" aria-label={message}>
          <span aria-hidden="true">{visibleMessage}</span>
          {!reducedMotion && (
            <span
              className="dash-header__typewriter-caret"
              aria-hidden="true"
            />
          )}
        </h1>
        <div className="dash-header__meta">
          <p className="dash-header__phase" aria-label={`Current phase: ${phaseLabel}`}>
            <span className="dash-header__phase-icon" aria-hidden="true">
              <NestIcon name={phaseIconName(phaseLabel)} />
            </span>
            <span className="dash-header__phase-name">{phaseLabel}</span>
          </p>
          <div
            ref={timerWrapRef}
            className="dash-header__timer-wrap"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPickerOpen(false);
              }
            }}
          >
            <button
              type="button"
              className={
                timerDue
                  ? "dash-header__timer dash-header__timer--due"
                  : "dash-header__timer"
              }
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label={
                timerDue
                  ? "Time to check in. Change interval"
                  : `Next check-in: ${countdown}. Change interval`
              }
              disabled={!timerState || scheduling}
              onClick={() => {
                setPickerOpen((open) => !open);
              }}
            >
              <span className="dash-header__timer-icon" aria-hidden="true">
                {clockIcon}
              </span>
              <strong
                className={
                  timerDue ? "dash-header__timer-label--due" : undefined
                }
              >
                {timerLabel}
              </strong>
              <span className="dash-header__timer-chevron" aria-hidden="true">
                {chevronDownIcon}
              </span>
            </button>
            {pickerOpen && (
              <div
                className="checkin-picker"
                role="listbox"
                aria-label="Next check-in in"
              >
                {TIMER_INTERVALS.map((minutes) => {
                  const selected = timerState?.intervalMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="checkin-picker__option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectInterval(minutes)}
                    >
                      <span>{minutes} min</span>
                      {selected && (
                        <span className="checkin-picker__mark">Current</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
