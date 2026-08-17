import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Metric, Phase, Pulse } from "../../lib/types";
import { chevronLeftIcon, chevronRightIcon } from "../components/icons";
import { isQuietPhase, phaseName, phaseTone, sortPhaseTotals } from "../lib/journal";
import {
  endOfDayMs,
  formatCompactDuration,
  formatHourTick,
  formatTime,
  previousDayMs,
  startOfDayMs,
} from "../lib/time";
import {
  buildJournalDay,
  buildTimeline,
  groupByDay,
  hourTicks,
  phaseSessionTotals,
  type JournalDay,
  type PhaseSession,
} from "../lib/timeline";
import { useDashboardData } from "../context/DashboardDataContext";
import { JournalEvents } from "./JournalEvents";

const JOURNAL_WINDOW_SECONDS = 30 * 24 * 60 * 60;
const JOURNAL_VIEWS = [
  { key: "daily", label: "Daily" },
  { key: "raw", label: "Raw" },
] as const;
type JournalViewKey = (typeof JOURNAL_VIEWS)[number]["key"];

function PhaseStrip({
  sessions,
  phases,
}: {
  sessions: PhaseSession[];
  phases: Phase[];
}) {
  const from = sessions[0].from;
  const to = sessions[sessions.length - 1].to;
  const span = to - from;
  const ticks = hourTicks(from, to);
  const summary = sessions
    .map((session) => {
      const name = phaseName(session.phaseId, phases);
      return `${name} ${formatTime(session.from)} to ${formatTime(session.to)}`;
    })
    .join(". ");

  return (
    <div className="journal-strip" role="img" aria-label={summary}>
      <div className="journal-strip__track">
        {sessions.map((session) => {
          const name = phaseName(session.phaseId, phases);
          const duration = session.to - session.from;
          const labeled = span > 0 && duration / span >= 0.14;
          return (
            <div
              key={`${session.from}-${session.phaseId}`}
              className={`journal-strip__seg journal-strip__seg--${phaseTone(name)}`}
              style={{ flexGrow: Math.max(duration, 1) }}
              title={`${name} · ${formatTime(session.from)} – ${formatTime(session.to)}`}
            >
              {labeled ? (
                <span className="journal-strip__name">{name}</span>
              ) : null}
            </div>
          );
        })}
      </div>
      {ticks.length > 0 ? (
        <div className="journal-strip__ticks">
          {ticks.map((tick) => (
            <span
              key={tick}
              className="journal-strip__tick"
              style={{ left: `${((tick - from) / span) * 100}%` }}
            >
              {formatHourTick(tick)}
            </span>
          ))}
        </div>
      ) : null}
    </div>
  );
}

function DayNav({
  label,
  canPrev,
  canNext,
  onPrev,
  onNext,
}: {
  label: string;
  canPrev: boolean;
  canNext: boolean;
  onPrev: () => void;
  onNext: () => void;
}) {
  return (
    <div className="journal-day-nav">
      <button
        type="button"
        className="journal-day-nav__btn"
        onClick={onPrev}
        disabled={!canPrev}
        aria-label="Previous day"
      >
        {chevronLeftIcon}
      </button>
      <h3 className="day-group__label">{label}</h3>
      <button
        type="button"
        className="journal-day-nav__btn"
        onClick={onNext}
        disabled={!canNext}
        aria-label="Next day"
      >
        {chevronRightIcon}
      </button>
    </div>
  );
}

function DayArticle({
  day,
  phases,
  metrics,
  pulses,
  expandedDumpIds,
  onDeleteCheckIn,
  onToggleDump,
  nav,
  showStrip,
}: {
  day: Pick<JournalDay, "label" | "sessions"> & {
    events: JournalDay["events"];
  };
  phases: Phase[];
  metrics: Metric[];
  pulses: Pulse[];
  expandedDumpIds: Set<number>;
  onDeleteCheckIn: (id: number) => void;
  onToggleDump: (id: number) => void;
  nav?: {
    canPrev: boolean;
    canNext: boolean;
    onPrev: () => void;
    onNext: () => void;
  };
  showStrip: boolean;
}) {
  const totals = showStrip
    ? sortPhaseTotals(phaseSessionTotals(day.sessions), phases)
    : [];

  return (
    <article className="day-group">
      <header className="day-group__head">
        {nav ? (
          <DayNav label={day.label} {...nav} />
        ) : (
          <h3 className="day-group__label">{day.label}</h3>
        )}
        {totals.length > 0 ? (
          <p className="day-group__totals">
            {totals.map((row) => {
              const name = phaseName(row.phaseId, phases);
              return (
                <span
                  key={String(row.phaseId)}
                  className={`day-group__total day-group__total--${phaseTone(name)}`}
                >
                  <i aria-hidden="true" />
                  {name} {formatCompactDuration(row.seconds)}
                </span>
              );
            })}
          </p>
        ) : null}
      </header>
      {showStrip && day.sessions.length > 0 ? (
        <PhaseStrip sessions={day.sessions} phases={phases} />
      ) : null}
      {day.events.length > 0 ? (
        <JournalEvents
          events={day.events}
          phases={phases}
          metrics={metrics}
          pulses={pulses}
          expandedDumpIds={expandedDumpIds}
          onDeleteCheckIn={onDeleteCheckIn}
          onToggleDump={onToggleDump}
        />
      ) : showStrip && day.sessions.length > 0 ? null : (
        <div className="dash-empty dash-empty--quiet">
          <strong>Nothing this day</strong>
          <span>Metric check-ins and brain dumps will land here.</span>
        </div>
      )}
    </article>
  );
}

export function JournalView() {
  const {
    metrics,
    pulses,
    phases,
    checkIns,
    phaseCheckIns,
    brainDumps,
    loaded,
    mutate,
  } = useDashboardData();
  const [journalView, setJournalView] = useState<JournalViewKey>("daily");
  const [selectedDayMs, setSelectedDayMs] = useState(() =>
    startOfDayMs(Date.now() / 1000),
  );
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(new Set());

  const todayMs = startOfDayMs(Date.now() / 1000);
  const oldestMs = startOfDayMs(Date.now() / 1000 - JOURNAL_WINDOW_SECONDS);
  const dayMs = Math.min(Math.max(selectedDayMs, oldestMs), todayMs);

  const selectedDay = useMemo(
    () =>
      buildJournalDay(
        checkIns,
        brainDumps,
        phaseCheckIns,
        dayMs,
        (phaseId) => isQuietPhase(phaseId, phases),
      ),
    [checkIns, brainDumps, phaseCheckIns, phases, dayMs],
  );
  const rawDays = useMemo(
    () => groupByDay(buildTimeline(checkIns, phaseCheckIns, brainDumps)),
    [checkIns, phaseCheckIns, brainDumps],
  );

  const onDeleteCheckIn = (id: number) =>
    void mutate(() => deleteMetricCheckIn(id));

  const toggleDumpExpanded = (id: number) => {
    setExpandedDumpIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const dayProps = {
    phases,
    metrics,
    pulses,
    expandedDumpIds,
    onDeleteCheckIn,
    onToggleDump: toggleDumpExpanded,
  };

  return (
    <section className="dash-section dash-section--journal">
      <div className="journal-toolbar">
        <div className="view-toggle" role="group" aria-label="Journal view">
          {JOURNAL_VIEWS.map((view) => (
            <button
              key={view.key}
              type="button"
              className={
                journalView === view.key
                  ? "view-toggle__btn view-toggle__btn--active"
                  : "view-toggle__btn"
              }
              aria-pressed={journalView === view.key}
              onClick={() => setJournalView(view.key)}
            >
              {view.label}
            </button>
          ))}
        </div>
      </div>
      {journalView === "daily" ? (
        loaded ? (
          <DayArticle
            day={selectedDay}
            nav={{
              canPrev: dayMs > oldestMs,
              canNext: dayMs < todayMs,
              onPrev: () => setSelectedDayMs(previousDayMs(dayMs)),
              onNext: () => setSelectedDayMs(endOfDayMs(dayMs)),
            }}
            showStrip
            {...dayProps}
          />
        ) : null
      ) : loaded && rawDays.length === 0 ? (
        <div className="dash-empty">
          <strong>Nothing here yet</strong>
          <span>
            Press <kbd>⌘⇧E</kbd> anywhere to log your first Metric check-in.
          </span>
        </div>
      ) : (
        rawDays.map((day) => (
          <DayArticle
            key={day.key}
            day={{ label: day.label, sessions: [], events: day.events }}
            showStrip={false}
            {...dayProps}
          />
        ))
      )}
    </section>
  );
}
