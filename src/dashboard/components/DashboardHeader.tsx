import { useEffect, useState } from "react";
import { scheduleNextCheckIn } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatCheckInCountdown, greetingForHour } from "../lib/time";
import { chevronDownIcon, clockIcon, nestMark, pencilIcon } from "./icons";

const CHECK_IN_INTERVALS = [5, 10, 15, 20, 25, 30] as const;

export type DashboardView =
  | "overview"
  | "insights"
  | "journal"
  | "tasks"
  | "metrics"
  | "phases";

const VIEWS: { key: DashboardView; label: string }[] = [
  { key: "overview", label: "Overview" },
  { key: "insights", label: "Insights" },
  { key: "journal", label: "Journal" },
  { key: "tasks", label: "Tasks" },
  { key: "metrics", label: "Metrics" },
  { key: "phases", label: "Phases" },
];

export function DashboardHeader({
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
  const { checkInSchedule, mutate } = useDashboardData();
  const [nowMs, setNowMs] = useState(() => Date.now());
  const [pickerOpen, setPickerOpen] = useState(false);
  const [scheduling, setScheduling] = useState(false);
  const now = new Date(nowMs);
  const greeting = greetingForHour(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const countdown = checkInSchedule
    ? formatCheckInCountdown(checkInSchedule.nextDueAt, nowMs)
    : "—:—";

  useEffect(() => {
    const interval = window.setInterval(() => setNowMs(Date.now()), 1_000);
    return () => window.clearInterval(interval);
  }, []);

  const selectInterval = async (minutes: number) => {
    setPickerOpen(false);
    if (scheduling) return;
    setScheduling(true);
    await mutate(() => scheduleNextCheckIn(minutes));
    setScheduling(false);
  };

  return (
    <header className="dash-header">
      <div className="dash-header__brand">
        <span className="dash-header__mark">{nestMark}</span>
        <span className="dash-header__name">Nest</span>
        <span className="dash-header__hint">
          <kbd>⌘⇧E</kbd>
          <span>check in from anywhere</span>
        </span>
      </div>
      <div className="dash-header__hero">
        <div>
          <h1 className="dash-header__greeting">{greeting}.</h1>
          <p className="dash-header__date">{dateLine}</p>
        </div>
        <div
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
            onClick={() => setPickerOpen((open) => !open)}
          >
            <span className="dash-header__timer-label">
              {clockIcon}
              {scheduling ? "Setting next check-in" : "Next check-in"}
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
      <div className="dash-header__nav-row">
        <nav className="dash-nav" aria-label="Views">
          {VIEWS.map((v) => (
            <button
              key={v.key}
              type="button"
              className={
                view === v.key
                  ? "dash-nav__btn dash-nav__btn--active"
                  : "dash-nav__btn"
              }
              aria-current={view === v.key ? "page" : undefined}
              onClick={() => onSelectView(v.key)}
            >
              {v.label}
            </button>
          ))}
        </nav>
        <button
          type="button"
          className="brain-dump-trigger"
          aria-expanded={brainDumpOpen}
          aria-controls="brain-dump-composer"
          onClick={onToggleBrainDump}
        >
          <span className="brain-dump-trigger__icon">{pencilIcon}</span>
          Brain dump
        </button>
      </div>
    </header>
  );
}
