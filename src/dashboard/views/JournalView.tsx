import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import type { Phase } from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  formatCompactDuration,
  formatHourTick,
  formatTime,
} from "../lib/time";
import {
  buildJournalDays,
  hourTicks,
  phaseSessionTotals,
  type PhaseSession,
  type TimelineEvent,
} from "../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";

const PHASE_ORDER = ["Doing", "Scoping", "Resting", "Offline", "Idle"];

const phaseName = (
  phaseId: number | null,
  phases: Phase[],
  fallback?: string | null,
) => {
  if (phaseId === null) return "Idle";
  return (
    phases.find((phase) => phase.id === phaseId)?.name ??
    fallback ??
    `Phase ${phaseId}`
  );
};

const phaseTone = (name: string) => {
  const tone = name.toLowerCase();
  if (
    tone === "doing" ||
    tone === "scoping" ||
    tone === "resting" ||
    tone === "offline" ||
    tone === "idle"
  ) {
    return tone;
  }
  return "unknown";
};

const isQuietPhase = (phaseId: number | null, phases: Phase[]) => {
  if (phaseId === null) return true;
  const name = phases.find((phase) => phase.id === phaseId)?.name;
  return name === "Resting" || name === "Offline";
};

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

export function JournalView() {
  const { metrics, phases, checkIns, phaseCheckIns, brainDumps, loaded, mutate } =
    useDashboardData();
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(new Set());

  const days = useMemo(
    () =>
      buildJournalDays(
        checkIns,
        brainDumps,
        phaseCheckIns,
        (phaseId) => isQuietPhase(phaseId, phases),
        Date.now(),
      ),
    [checkIns, brainDumps, phaseCheckIns, phases],
  );

  const metricById = (id: number) => metrics.find((m) => m.id === id);

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

  const totalsFor = (sessions: PhaseSession[]) =>
    phaseSessionTotals(sessions)
      .filter((row) => row.seconds > 0)
      .sort((a, b) => {
        const aName = phaseName(a.phaseId, phases);
        const bName = phaseName(b.phaseId, phases);
        const aOrder = PHASE_ORDER.indexOf(aName);
        const bOrder = PHASE_ORDER.indexOf(bName);
        return (
          (aOrder === -1 ? PHASE_ORDER.length : aOrder) -
          (bOrder === -1 ? PHASE_ORDER.length : bOrder)
        );
      });

  const renderEvent = (ev: TimelineEvent) => {
    switch (ev.kind) {
      case "metrics":
        return (
          <li key={`metrics-${ev.checkIn.id}`} className="event event--metrics">
            <div className="event__meta">
              <span className="event__type">
                {ev.checkIn.pulseName ?? "Pulse check-in"}
              </span>
              <time className="event__time">{formatTime(ev.at)}</time>
              <button
                type="button"
                className="event__delete"
                onClick={() => onDeleteCheckIn(ev.checkIn.id)}
                aria-label="Delete check-in"
                title="Delete check-in"
              >
                ×
              </button>
            </div>
            <ul className="event__ratings">
              {ev.checkIn.ratings.map((r) => (
                <li key={r.metricId} className="event__rating">
                  <span className="event__rating-name">
                    {metricById(r.metricId)?.name ?? `Metric ${r.metricId}`}
                  </span>
                  <span className={`rating-pill rating-pill--v${r.value}`}>
                    {r.value}
                  </span>
                </li>
              ))}
            </ul>
          </li>
        );
      case "dump":
        return (
          <li key={`dump-${ev.dump.id}`} className="event event--dump">
            <div className="event__meta">
              <span className="event__type">Brain dump</span>
              <time className="event__time">{formatTime(ev.at)}</time>
            </div>
            <BrainDumpEntry
              dump={ev.dump}
              className="event-dump"
              expanded={expandedDumpIds.has(ev.dump.id)}
              onToggle={() => toggleDumpExpanded(ev.dump.id)}
            />
          </li>
        );
      case "phase":
        return null;
    }
  };

  return (
    <section className="dash-section dash-section--journal">
      <header className="dash-section__head">
        <div className="dash-section__title">
          <h2>Journal</h2>
          <span className="dash-section__sub">Last 30 days</span>
        </div>
      </header>
      {loaded && days.length === 0 ? (
        <div className="dash-empty">
          <strong>Nothing here yet</strong>
          <span>
            Press <kbd>⌘⇧E</kbd> anywhere to log your first check-in.
          </span>
        </div>
      ) : (
        days.map((day) => {
          const totals = totalsFor(day.sessions);
          return (
            <article className="day-group" key={day.key}>
              <header className="day-group__head">
                <h3 className="day-group__label">{day.label}</h3>
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
              {day.sessions.length > 0 ? (
                <PhaseStrip sessions={day.sessions} phases={phases} />
              ) : null}
              {day.events.length > 0 ? (
                <ol className="timeline">{day.events.map(renderEvent)}</ol>
              ) : null}
            </article>
          );
        })
      )}
    </section>
  );
}
