import {
  useEffect,
  useMemo,
  useRef,
  useState,
  type CSSProperties,
} from "react";
import { startTimer } from "../../lib/commands";
import { SIMPLIFIED_VIEW } from "../../lib/simplifiedView";
import { useDashboardData } from "../context/DashboardDataContext";
import { useTileIcons } from "../hooks/useTileIcons";
import { OVERVIEW_SETTINGS_ID } from "../lib/overviewGrid";
import {
  advanceTypewriter,
  INITIAL_TYPEWRITER_FRAME,
  TYPEWRITER_CYCLE_MS,
} from "../lib/typewriter";
import { greetingForHour } from "../lib/time";
import {
  formatTimerCountdown,
  isTimerDue,
  TIMER_INTERVALS,
} from "../../lib/timer";
import { phaseColor, phaseIcon, phaseName } from "../lib/period";
import { IconPickerButton, NestIcon } from "./PulseIcon";
import { chevronDownIcon, clockIcon, settingsIcon } from "./icons";
import { writeTileIcon, type ConfigurableOverviewIcon } from "../lib/tileIcons";

export type DashboardView =
  | "overview"
  | "calendar"
  | "core"
  | "assistant"
  | "settings";

const VIEWS: {
  key: DashboardView;
  label: string;
  icon: ConfigurableOverviewIcon;
}[] = [
  { key: "overview", label: "Overview", icon: "overview" },
  { key: "calendar", label: "Calendar", icon: "calendar" },
  { key: "core", label: "Core", icon: "core" },
  { key: "assistant", label: "Assistant", icon: "assistant" },
  { key: "settings", label: "Settings", icon: "settings" },
];

export function DashboardSidebar({
  view,
  onSelectView,
}: {
  view: DashboardView;
  onSelectView: (view: DashboardView) => void;
}) {
  const tileIcons = useTileIcons();

  return (
    <aside className="dash-sidebar">
      <nav className="dash-nav" aria-label="Dashboard sections">
        {VIEWS.filter((item) =>
          !SIMPLIFIED_VIEW || item.key === "calendar" || item.key === "core",
        ).map((item) => {
          const label = (
            <span className="dash-nav__label">{item.label}</span>
          );
          // First click selects the Section. The selected icon opens the picker.
          if (view === item.key) {
            return (
              <IconPickerButton
                key={item.key}
                controlClassName="dash-nav__picker"
                triggerClassName="dash-nav__btn dash-nav__btn--active"
                icon={tileIcons[item.icon]}
                label={item.label}
                title=""
                ariaLabel={`${item.label}, choose icon`}
                ariaCurrent="page"
                onChange={(nextIcon) => writeTileIcon(item.icon, nextIcon)}
              >
                {label}
              </IconPickerButton>
            );
          }
          return (
            <button
              key={item.key}
              type="button"
              className="dash-nav__btn"
              aria-label={item.label}
              onClick={() => onSelectView(item.key)}
            >
              <span className="dash-nav__icon">
                <NestIcon name={tileIcons[item.icon]} />
              </span>
              {label}
            </button>
          );
        })}
      </nav>
    </aside>
  );
}

export function DashboardHeader({
  overviewSettings,
}: {
  overviewSettings?: { open: boolean; onToggle: () => void };
}) {
  const {
    timerState,
    phases,
    latestPhase,
    reminders,
    mutate,
  } = useDashboardData();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const [typewriter, setTypewriter] = useState(INITIAL_TYPEWRITER_FRAME);
  const [reducedMotion, setReducedMotion] = useState(() =>
    window.matchMedia("(prefers-reduced-motion: reduce)").matches,
  );
  const timerWrapRef = useRef<HTMLDivElement | null>(null);
  const now = new Date(nowMs);
  const greeting = greetingForHour(now.getHours());
  const activeReminderTexts = useMemo(
    () => reminders.filter((reminder) => reminder.active).map((r) => r.text),
    [reminders],
  );
  const messages = useMemo(
    () => [`${greeting}.`, ...activeReminderTexts],
    [greeting, activeReminderTexts],
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
  const timerLabel = timerDue ? "Timer due" : countdown;

  const currentPhaseName = latestPhase
    ? phaseName(latestPhase.phaseId, phases, latestPhase.phaseLabel)
    : null;
  const currentPhaseId = latestPhase?.phaseId ?? null;
  const currentPhaseColor = phaseColor(currentPhaseId, phases);
  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

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
    <header className="dash-header" aria-label="Greetings board">
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
          <p
            className={`dash-header__phase${
              currentPhaseColor ? " dash-header__phase--colored" : ""
            }`}
            aria-label={`Current phase: ${phaseLabel}`}
            style={
              currentPhaseColor
                ? ({ "--phase-color": currentPhaseColor } as CSSProperties)
                : undefined
            }
          >
            <span className="dash-header__phase-icon" aria-hidden="true">
              <NestIcon
                name={phaseIcon(currentPhaseId, phases, phaseLabel)}
              />
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
                  ? "Timer due. Change interval"
                  : `Timer in ${countdown}. Change interval`
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
                className="timer-picker"
                role="listbox"
                aria-label="Timer interval"
              >
                {TIMER_INTERVALS.map((minutes) => {
                  const selected = timerState?.intervalMinutes === minutes;
                  return (
                    <button
                      key={minutes}
                      type="button"
                      role="option"
                      aria-selected={selected}
                      className="timer-picker__option"
                      onMouseDown={(event) => event.preventDefault()}
                      onClick={() => selectInterval(minutes)}
                    >
                      <span>{minutes} min</span>
                      {selected && (
                        <span className="timer-picker__mark">Current</span>
                      )}
                    </button>
                  );
                })}
              </div>
            )}
          </div>
          {overviewSettings ? (
            <button
              type="button"
              className="dash-header__settings"
              aria-label={
                overviewSettings.open
                  ? "Close Overview settings"
                  : "Open Overview settings"
              }
              title="Configure Overview"
              aria-expanded={overviewSettings.open}
              aria-controls={OVERVIEW_SETTINGS_ID}
              onClick={overviewSettings.onToggle}
            >
              {settingsIcon}
            </button>
          ) : null}
        </div>
      </div>
    </header>
  );
}
