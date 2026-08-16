import { useEffect, useMemo, useRef, useState } from "react";
import {
  listReminders,
  scheduleNextCheckIn,
  submitPhaseCheckIn,
  summonCheckIn,
} from "../../lib/commands";
import type { Phase } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import { latestPulseState } from "../lib/pulse";
import {
  advanceTypewriter,
  INITIAL_TYPEWRITER_FRAME,
  TYPEWRITER_CYCLE_MS,
} from "../lib/typewriter";
import {
  formatCheckInCountdown,
  formatElapsedMinutes,
  greetingForHour,
} from "../lib/time";
import {
  chevronDownIcon,
  clockIcon,
  insightsIcon,
  journalIcon,
  metricsIcon,
  overviewIcon,
  pencilIcon,
  phasesIcon,
  tasksIcon,
} from "./icons";

const CHECK_IN_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

export type DashboardView =
  | "overview"
  | "insights"
  | "journal"
  | "tasks"
  | "metrics"
  | "phases";

const VIEWS = [
  { key: "overview", label: "Overview", icon: overviewIcon },
  { key: "insights", label: "Insights", icon: insightsIcon },
  { key: "journal", label: "Journal", icon: journalIcon },
  { key: "tasks", label: "Tasks", icon: tasksIcon },
  { key: "metrics", label: "Metrics", icon: metricsIcon },
  { key: "phases", label: "Phases", icon: phasesIcon },
] as const;

export function DashboardSidebar({
  view,
  onSelectView,
  brainDumpOpen,
  onToggleBrainDump,
}: {
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
  brainDumpOpen: boolean;
  onToggleBrainDump: () => void;
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
      <button
        type="button"
        className="brain-dump-trigger"
        aria-label={brainDumpOpen ? "Close brain dump" : "Open brain dump"}
        aria-expanded={brainDumpOpen}
        aria-controls="brain-dump-composer"
        onClick={onToggleBrainDump}
      >
        <span className="brain-dump-trigger__icon">{pencilIcon}</span>
        <span className="dash-nav__label">Brain dump</span>
      </button>
    </aside>
  );
}

export function DashboardHeader() {
  const {
    checkInSchedule,
    phases,
    latestPhase,
    checkIns,
    metrics,
    mutate,
    setError,
  } = useDashboardData();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [phasePickerOpen, setPhasePickerOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [phaseChangingId, setPhaseChangingId] = useState<number | null>(null);
  const [pulseOpening, setPulseOpening] = useState(false);
  const [reminders, setReminders] = useState<string[]>([]);
  const [typewriter, setTypewriter] = useState(INITIAL_TYPEWRITER_FRAME);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const phaseWrapRef = useRef<HTMLDivElement | null>(null);
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
  const countdown = checkInSchedule
    ? formatCheckInCountdown(checkInSchedule.nextDueAt, nowMs)
    : "—:—";
  const pulse = latestPulseState(checkIns, metrics, nowMs);

  const activePhases = useMemo(
    () =>
      [...phases]
        .filter((phase) => phase.inactiveSince === null)
        .sort((a, b) => a.createdAt - b.createdAt || a.id - b.id),
    [phases],
  );

  const currentPhaseName = latestPhase
    ? latestPhase.phaseId === null
      ? "Idle"
      : (phases.find((phase) => phase.id === latestPhase.phaseId)?.name ??
        latestPhase.phaseLabel ??
        `Phase ${latestPhase.phaseId}`)
    : null;
  const currentPhaseDuration = latestPhase
    ? formatElapsedMinutes(latestPhase.createdAt, nowMs)
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

  // Blur alone misses clicks on non-focusable dashboard chrome; close on
  // outside pointerdown so either picker dismisses when you click elsewhere.
  useEffect(() => {
    if (!pickerOpen && !phasePickerOpen) return;
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as Node | null;
      if (!target) return;
      if (
        phasePickerOpen &&
        phaseWrapRef.current &&
        !phaseWrapRef.current.contains(target)
      ) {
        setPhasePickerOpen(false);
      }
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
      setPhasePickerOpen(false);
      setPickerOpen(false);
    };
    document.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [pickerOpen, phasePickerOpen]);

  const selectInterval = async (minutes: number) => {
    setPickerOpen(false);
    if (scheduling) return;
    setScheduling(true);
    await mutate(() => scheduleNextCheckIn(minutes));
    setScheduling(false);
  };

  const selectPhase = async (phase: Phase) => {
    setPhasePickerOpen(false);
    if (latestPhase?.phaseId === phase.id || phaseChangingId !== null) return;
    setPhaseChangingId(phase.id);
    await mutate(() => submitPhaseCheckIn(phase.id));
    setPhaseChangingId(null);
  };

  const openPulseCheckIn = async () => {
    if (pulseOpening) return;
    setPulseOpening(true);
    try {
      await summonCheckIn();
    } catch (e) {
      setError(String(e));
    } finally {
      setPulseOpening(false);
    }
  };

  const phaseLabel =
    phaseChangingId !== null
      ? "Changing…"
      : (currentPhaseName ?? "No phase yet");

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
          <div
            ref={phaseWrapRef}
            className="dash-header__phase-wrap"
            onBlur={(event) => {
              if (!event.currentTarget.contains(event.relatedTarget)) {
                setPhasePickerOpen(false);
              }
            }}
          >
            <button
              type="button"
              className="dash-header__phase"
              aria-haspopup="listbox"
              aria-expanded={phasePickerOpen}
              aria-label={`Current phase: ${phaseLabel}${
                currentPhaseDuration ? `, ${currentPhaseDuration}` : ""
              }. Change phase`}
              disabled={activePhases.length === 0 || phaseChangingId !== null}
              onClick={() => {
                setPickerOpen(false);
                setPhasePickerOpen((open) => !open);
              }}
            >
              <span className="dash-header__phase-name">{phaseLabel}</span>
              {currentPhaseDuration && phaseChangingId === null && (
                <>
                  <span className="dash-header__phase-sep" aria-hidden="true">
                    ·
                  </span>
                  <span className="dash-header__phase-meta">
                    {currentPhaseDuration}
                  </span>
                </>
              )}
              <span className="dash-header__phase-chevron" aria-hidden="true">
                {chevronDownIcon}
              </span>
            </button>
            {phasePickerOpen && (
              <div className="phase-picker" role="listbox" aria-label="Phase">
                {activePhases.length === 0 ? (
                  <div className="phase-picker__empty">No active phases</div>
                ) : (
                  activePhases.map((phase) => {
                    const selected = latestPhase?.phaseId === phase.id;
                    return (
                      <button
                        key={phase.id}
                        type="button"
                        role="option"
                        aria-selected={selected}
                        className="phase-picker__option"
                        onMouseDown={(event) => event.preventDefault()}
                        onClick={() => selectPhase(phase)}
                      >
                        <span className="phase-picker__dot" />
                        <span>{phase.name}</span>
                        {selected && (
                          <span className="phase-picker__mark">Current</span>
                        )}
                      </button>
                    );
                  })
                )}
              </div>
            )}
          </div>
          <button
            type="button"
            className={`dash-header__pulse${
              pulse.overdue ? " dash-header__pulse--overdue" : ""
            }`}
            aria-label={`${pulse.message}. Open pulse check-in`}
            disabled={pulseOpening}
            onClick={openPulseCheckIn}
          >
            {pulseOpening ? "Opening…" : pulse.message}
          </button>
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
              className="dash-header__timer"
              aria-haspopup="listbox"
              aria-expanded={pickerOpen}
              aria-label={`Next check-in: ${countdown}. Change interval`}
              disabled={!checkInSchedule || scheduling}
              onClick={() => {
                setPhasePickerOpen(false);
                setPickerOpen((open) => !open);
              }}
            >
              <span className="dash-header__timer-icon" aria-hidden="true">
                {clockIcon}
              </span>
              <strong>{countdown}</strong>
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
                {CHECK_IN_INTERVALS.map((minutes) => {
                  const selected = checkInSchedule?.intervalMinutes === minutes;
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
