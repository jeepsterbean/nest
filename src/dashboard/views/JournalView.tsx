import { useMemo, useState } from "react";
import { deleteMetricCheckIn } from "../../lib/commands";
import { useDashboardData } from "../context/DashboardDataContext";
import { formatTime } from "../lib/time";
import { buildTimeline, groupByDay, type TimelineEvent } from "../lib/timeline";
import { BrainDumpEntry } from "./BrainDumpEntry";

export function JournalView() {
  const { metrics, phases, checkIns, phaseCheckIns, brainDumps, loaded, mutate } =
    useDashboardData();
  const [expandedDumpIds, setExpandedDumpIds] = useState<Set<number>>(new Set());

  const events = useMemo(
    () => buildTimeline(checkIns, phaseCheckIns, brainDumps),
    [checkIns, phaseCheckIns, brainDumps],
  );
  const dayGroups = useMemo(() => groupByDay(events), [events]);

  const metricById = (id: number) => metrics.find((m) => m.id === id);
  const phaseById = (id: number) => phases.find((p) => p.id === id);

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

  const renderEvent = (ev: TimelineEvent) => {
    switch (ev.kind) {
      case "metrics":
        return (
          <li key={`metrics-${ev.checkIn.id}`} className="event event--metrics">
            <div className="event__meta">
              <span className="event__type">Check-in</span>
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
      case "phase": {
        const name =
          phaseById(ev.checkIn.phaseId)?.name ??
          ev.checkIn.phaseLabel ??
          `Phase ${ev.checkIn.phaseId}`;
        return (
          <li key={`phase-${ev.checkIn.id}`} className="event event--phase">
            <div className="event__meta">
              <span className="event__type">Phase</span>
              <time className="event__time">{formatTime(ev.at)}</time>
            </div>
            <p className="event__phase">
              Settled into <strong>{name}</strong>
            </p>
          </li>
        );
      }
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
      {loaded && dayGroups.length === 0 ? (
        <div className="dash-empty">
          <strong>Nothing here yet</strong>
          <span>
            Press <kbd>⌘⇧E</kbd> anywhere to log your first check-in.
          </span>
        </div>
      ) : (
        dayGroups.map((g) => (
          <div className="day-group" key={g.key}>
            <h3 className="day-group__label">{g.label}</h3>
            <ol className="timeline">{g.events.map(renderEvent)}</ol>
          </div>
        ))
      )}
    </section>
  );
}
