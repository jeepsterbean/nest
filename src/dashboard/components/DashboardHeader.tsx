import { greetingForHour } from "../lib/time";
import { nestMark, pencilIcon } from "./icons";

export type DashboardView =
  | "overview"
  | "journal"
  | "tasks"
  | "metrics"
  | "phases";

const VIEWS: { key: DashboardView; label: string }[] = [
  { key: "overview", label: "Overview" },
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
  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
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
      <h1 className="dash-header__greeting">{greeting}.</h1>
      <p className="dash-header__date">{dateLine}</p>
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
