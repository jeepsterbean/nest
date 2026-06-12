import { useEffect, useMemo, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createMetric,
  createPhase,
  deleteMetricCheckIn,
  latestPhaseCheckIn,
  listBrainDumps,
  listMetricCheckIns,
  listMetrics,
  listPhaseCheckIns,
  listPhases,
  renameMetric,
  renamePhase,
  setMetricActive,
  setPhaseActive,
} from "../lib/commands";
import type {
  BrainDump,
  Metric,
  MetricCheckInWithRatings,
  Phase,
  PhaseCheckIn,
} from "../lib/types";
import "./Dashboard.css";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;
const SEVEN_DAYS_SECONDS = 7 * 24 * 60 * 60;

type TimelineEvent =
  | { kind: "metrics"; at: number; checkIn: MetricCheckInWithRatings }
  | { kind: "phase"; at: number; checkIn: PhaseCheckIn }
  | { kind: "dump"; at: number; dump: BrainDump };

type DayGroup = { key: number; label: string; events: TimelineEvent[] };

// A popup submit writes phase, then metrics, then the brain dump within the
// same second — rank them so the feed still reads newest-first.
const KIND_RANK: Record<TimelineEvent["kind"], number> = {
  dump: 0,
  metrics: 1,
  phase: 2,
};

const startOfDayMs = (tsSecs: number) => {
  const d = new Date(tsSecs * 1000);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const previousDayMs = (dayMs: number) => {
  const d = new Date(dayMs);
  d.setDate(d.getDate() - 1);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
};

const dayLabel = (tsSecs: number) => {
  const day = startOfDayMs(tsSecs);
  const today = startOfDayMs(Date.now() / 1000);
  if (day === today) return "Today";
  if (day === previousDayMs(today)) return "Yesterday";
  return new Date(tsSecs * 1000).toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
};

// Days in a row with at least one entry. Today not having one yet doesn't
// break the streak — it just isn't counted.
const computeStreak = (eventTimes: number[]) => {
  const days = new Set(eventTimes.map(startOfDayMs));
  let cursor = startOfDayMs(Date.now() / 1000);
  if (!days.has(cursor)) cursor = previousDayMs(cursor);
  let streak = 0;
  while (days.has(cursor)) {
    streak += 1;
    cursor = previousDayMs(cursor);
  }
  return streak;
};

const greetingForHour = (hour: number) => {
  if (hour < 5) return "Up late";
  if (hour < 12) return "Good morning";
  if (hour < 18) return "Good afternoon";
  return "Good evening";
};

const formatTime = (ts: number) =>
  new Date(ts * 1000).toLocaleTimeString(undefined, {
    hour: "numeric",
    minute: "2-digit",
  });

const iconProps = {
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeWidth: 1.8,
  strokeLinecap: "round",
  strokeLinejoin: "round",
  "aria-hidden": true,
} as const;

const nestMark = (
  <svg {...iconProps}>
    <circle cx="12" cy="8.5" r="4" />
    <path d="M4 11a8 8 0 0 0 16 0" />
    <path d="M6.5 13.5c1.8 1 3.6 1.5 5.5 1.5s3.7-.5 5.5-1.5" />
  </svg>
);

const flagIcon = (
  <svg {...iconProps}>
    <path d="M4 15s1-1 4-1 5 2 8 2 4-1 4-1V3s-1 1-4 1-5-2-8-2-4 1-4 1z" />
    <line x1="4" x2="4" y1="22" y2="15" />
  </svg>
);

const checkCircleIcon = (
  <svg {...iconProps}>
    <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
    <polyline points="22 4 12 14.01 9 11.01" />
  </svg>
);

const pencilIcon = (
  <svg {...iconProps}>
    <path d="M17 3a2.828 2.828 0 1 1 4 4L7.5 20.5 2 22l1.5-5.5L17 3z" />
  </svg>
);

const flameIcon = (
  <svg {...iconProps}>
    <path d="M8.5 14.5A2.5 2.5 0 0 0 11 12c0-1.38-.5-2-1-3-1.072-2.143-.224-4.054 2-6 .5 2.5 2 4.9 4 6.5 2 1.6 3 3.5 3 5.5a7 7 0 1 1-14 0c0-1.153.433-2.294 1-3a2.5 2.5 0 0 0 2.5 2.5z" />
  </svg>
);

function Sparkline({ values }: { values: number[] }) {
  if (values.length < 2) {
    return (
      <div className="sparkline sparkline--empty">
        {values.length === 1 ? "First entry logged" : "No entries yet"}
      </div>
    );
  }
  const width = 100;
  const height = 32;
  const pad = 3;
  const stepX = (width - pad * 2) / (values.length - 1);
  const yFor = (value: number) =>
    height - pad - ((value - 1) / 4) * (height - pad * 2);
  const points = values.map(
    (value, i) => [pad + i * stepX, yFor(value)] as const,
  );
  const line = points
    .map(([x, y]) => `${x.toFixed(2)},${y.toFixed(2)}`)
    .join(" ");
  const [lastX, lastY] = points[points.length - 1];
  const area = `M ${points[0][0].toFixed(2)},${height} L ${line
    .split(" ")
    .join(" L ")} L ${lastX.toFixed(2)},${height} Z`;
  return (
    <svg
      className="sparkline"
      viewBox={`0 0 ${width} ${height}`}
      preserveAspectRatio="none"
      aria-hidden="true"
    >
      <path className="sparkline__area" d={area} />
      <polyline
        className="sparkline__line"
        points={line}
        vectorEffect="non-scaling-stroke"
      />
      <polyline
        className="sparkline__dot"
        points={`${lastX},${lastY} ${lastX},${lastY}`}
        vectorEffect="non-scaling-stroke"
      />
    </svg>
  );
}

function Switch({
  checked,
  onChange,
  label,
}: {
  checked: boolean;
  onChange: () => void;
  label: string;
}) {
  return (
    <label
      className="switch"
      title={checked ? "Active — click to pause" : "Paused — click to resume"}
    >
      <input
        type="checkbox"
        checked={checked}
        onChange={onChange}
        aria-label={label}
      />
      <span className="switch__track" aria-hidden="true" />
    </label>
  );
}

function Dashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checkIns, setCheckIns] = useState<MetricCheckInWithRatings[]>([]);
  const [phaseCheckIns, setPhaseCheckIns] = useState<PhaseCheckIn[]>([]);
  const [brainDumps, setBrainDumps] = useState<BrainDump[]>([]);
  const [latestPhase, setLatestPhase] = useState<PhaseCheckIn | null>(null);
  const [newMetricName, setNewMetricName] = useState("");
  const [newPhaseName, setNewPhaseName] = useState("");
  const [editingId, setEditingId] = useState<number | null>(null);
  const [editingName, setEditingName] = useState("");
  const [editingPhaseId, setEditingPhaseId] = useState<number | null>(null);
  const [editingPhaseName, setEditingPhaseName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [loaded, setLoaded] = useState(false);

  const reload = async () => {
    try {
      const now = Math.floor(Date.now() / 1000);
      const from = now - THIRTY_DAYS_SECONDS;
      const to = now + 1;
      const [m, p, ci, pci, bd, lp] = await Promise.all([
        listMetrics(true),
        listPhases(true),
        listMetricCheckIns(from, to),
        listPhaseCheckIns(from, to),
        listBrainDumps(from, to),
        latestPhaseCheckIn(),
      ]);
      setMetrics(m);
      setPhases(p);
      setCheckIns(ci);
      setPhaseCheckIns(pci);
      setBrainDumps(bd);
      setLatestPhase(lp);
    } catch (e) {
      setError(String(e));
    } finally {
      setLoaded(true);
    }
  };

  useEffect(() => {
    reload();
  }, []);

  // Refresh when a check-in is submitted from the popup
  useEffect(() => {
    let unlisten: (() => void) | undefined;
    listen("check-in-submitted", () => {
      reload();
    }).then((u) => {
      unlisten = u;
    });
    return () => {
      if (unlisten) unlisten();
    };
  }, []);

  const onCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newMetricName.trim();
    if (!name) return;
    try {
      await createMetric(name);
      setNewMetricName("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onCreatePhase = async (e: React.FormEvent) => {
    e.preventDefault();
    const name = newPhaseName.trim();
    if (!name) return;
    try {
      await createPhase(name);
      setNewPhaseName("");
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const startEdit = (m: Metric) => {
    setEditingId(m.id);
    setEditingName(m.name);
  };

  const commitEdit = async () => {
    if (editingId === null) return;
    const name = editingName.trim();
    const id = editingId;
    setEditingId(null);
    if (!name) return;
    const current = metrics.find((m) => m.id === id);
    if (current && current.name === name) return;
    try {
      await renameMetric(id, name);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const startPhaseEdit = (p: Phase) => {
    setEditingPhaseId(p.id);
    setEditingPhaseName(p.name);
  };

  const commitPhaseEdit = async () => {
    if (editingPhaseId === null) return;
    const name = editingPhaseName.trim();
    const id = editingPhaseId;
    setEditingPhaseId(null);
    if (!name) return;
    const current = phases.find((p) => p.id === id);
    if (current && current.name === name) return;
    try {
      await renamePhase(id, name);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onToggleActive = async (m: Metric) => {
    try {
      await setMetricActive(m.id, m.inactiveSince !== null);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onTogglePhaseActive = async (p: Phase) => {
    try {
      await setPhaseActive(p.id, p.inactiveSince !== null);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const onDeleteCheckIn = async (id: number) => {
    try {
      await deleteMetricCheckIn(id);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const metricById = (id: number) => metrics.find((m) => m.id === id);
  const phaseById = (id: number) => phases.find((p) => p.id === id);

  const sortedMetrics = useMemo(
    () =>
      [...metrics].sort(
        (a, b) =>
          Number(a.inactiveSince !== null) - Number(b.inactiveSince !== null) ||
          a.createdAt - b.createdAt ||
          a.id - b.id,
      ),
    [metrics],
  );

  const sortedPhases = useMemo(
    () =>
      [...phases].sort(
        (a, b) =>
          Number(a.inactiveSince !== null) - Number(b.inactiveSince !== null) ||
          a.createdAt - b.createdAt ||
          a.id - b.id,
      ),
    [phases],
  );

  // Per-metric rating values in chronological order, for sparklines and stats.
  const seriesByMetric = useMemo(() => {
    const map = new Map<number, number[]>();
    const chronological = [...checkIns].sort(
      (a, b) => a.createdAt - b.createdAt,
    );
    for (const ci of chronological) {
      for (const r of ci.ratings) {
        const values = map.get(r.metricId);
        if (values) values.push(r.value);
        else map.set(r.metricId, [r.value]);
      }
    }
    return map;
  }, [checkIns]);

  const events = useMemo<TimelineEvent[]>(() => {
    const all: TimelineEvent[] = [
      ...checkIns.map((ci) => ({
        kind: "metrics" as const,
        at: ci.createdAt,
        checkIn: ci,
      })),
      ...phaseCheckIns.map((ci) => ({
        kind: "phase" as const,
        at: ci.createdAt,
        checkIn: ci,
      })),
      ...brainDumps.map((d) => ({
        kind: "dump" as const,
        at: d.createdAt,
        dump: d,
      })),
    ];
    return all.sort(
      (a, b) => b.at - a.at || KIND_RANK[a.kind] - KIND_RANK[b.kind],
    );
  }, [checkIns, phaseCheckIns, brainDumps]);

  const dayGroups = useMemo<DayGroup[]>(() => {
    const groups: DayGroup[] = [];
    for (const ev of events) {
      const key = startOfDayMs(ev.at);
      const last = groups[groups.length - 1];
      if (last && last.key === key) last.events.push(ev);
      else groups.push({ key, label: dayLabel(ev.at), events: [ev] });
    }
    return groups;
  }, [events]);

  const now = new Date();
  const greeting = greetingForHour(now.getHours());
  const dateLine = now.toLocaleDateString(undefined, {
    weekday: "long",
    month: "long",
    day: "numeric",
  });
  const weekAgo = Math.floor(now.getTime() / 1000) - SEVEN_DAYS_SECONDS;
  const weeklyCheckIns = checkIns.filter((c) => c.createdAt >= weekAgo).length;
  const weeklyDumps = brainDumps.filter((d) => d.createdAt >= weekAgo).length;
  const streak = computeStreak(events.map((ev) => ev.at));
  const currentPhaseName = latestPhase
    ? (phaseById(latestPhase.phaseId)?.name ??
      latestPhase.phaseLabel ??
      `Phase ${latestPhase.phaseId}`)
    : null;

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
            <p className="event__text">{ev.dump.text}</p>
          </li>
        );
    }
  };

  return (
    <main className="dashboard">
      <div className="dashboard__inner">
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
          <ul className="dash-stats">
            <li className="dash-stat dash-stat--phase">
              {flagIcon}
              <div>
                <strong>{currentPhaseName ?? "None yet"}</strong>
                <span>Current phase</span>
              </div>
            </li>
            <li className="dash-stat dash-stat--checkins">
              {checkCircleIcon}
              <div>
                <strong>{weeklyCheckIns}</strong>
                <span>Check-ins · 7d</span>
              </div>
            </li>
            <li className="dash-stat dash-stat--dumps">
              {pencilIcon}
              <div>
                <strong>{weeklyDumps}</strong>
                <span>Brain dumps · 7d</span>
              </div>
            </li>
            <li className="dash-stat dash-stat--streak">
              {flameIcon}
              <div>
                <strong>
                  {streak === 0 ? "—" : `${streak} day${streak === 1 ? "" : "s"}`}
                </strong>
                <span>Streak</span>
              </div>
            </li>
          </ul>
        </header>

        {error && (
          <div className="dashboard__error" role="alert">
            <span>{error}</span>
            <button
              type="button"
              onClick={() => setError(null)}
              aria-label="Dismiss error"
            >
              ×
            </button>
          </div>
        )}

        <section className="dash-section dash-section--metrics">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Metrics</h2>
              <span className="dash-section__sub">
                How you've been feeling · last 30 days
              </span>
            </div>
            <form className="add-form" onSubmit={onCreate}>
              <input
                type="text"
                placeholder="New metric…"
                aria-label="New metric name"
                value={newMetricName}
                onChange={(e) => setNewMetricName(e.target.value)}
              />
              <button type="submit" disabled={!newMetricName.trim()}>
                Add
              </button>
            </form>
          </header>
          {loaded && metrics.length === 0 ? (
            <div className="dash-empty">
              <strong>No metrics yet</strong>
              <span>Add one above to start tracking how you feel.</span>
            </div>
          ) : (
            <ul className="metric-grid">
              {sortedMetrics.map((m) => {
                const active = m.inactiveSince === null;
                const values = seriesByMetric.get(m.id) ?? [];
                const latest = values.length
                  ? values[values.length - 1]
                  : null;
                const avg = values.length
                  ? values.reduce((sum, v) => sum + v, 0) / values.length
                  : null;
                return (
                  <li
                    key={m.id}
                    className={`metric-card${active ? "" : " metric-card--inactive"}`}
                  >
                    <div className="metric-card__top">
                      {editingId === m.id ? (
                        <input
                          type="text"
                          className="rename-input"
                          value={editingName}
                          autoFocus
                          onChange={(e) => setEditingName(e.target.value)}
                          onBlur={commitEdit}
                          onKeyDown={(e) => {
                            if (e.key === "Enter") {
                              e.preventDefault();
                              commitEdit();
                            }
                            if (e.key === "Escape") setEditingId(null);
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="metric-card__name"
                          onClick={() => startEdit(m)}
                          title="Click to rename"
                        >
                          {m.name}
                        </button>
                      )}
                      {!active && <span className="paused-tag">Paused</span>}
                      <Switch
                        checked={active}
                        onChange={() => onToggleActive(m)}
                        label={`${m.name} active`}
                      />
                    </div>
                    <Sparkline values={values} />
                    {values.length > 0 && (
                      <div className="metric-card__stats">
                        {latest !== null && (
                          <span
                            className={`rating-pill rating-pill--v${latest}`}
                          >
                            {latest}
                          </span>
                        )}
                        <span>avg {avg?.toFixed(1)}</span>
                        <span>
                          · {values.length}{" "}
                          {values.length === 1 ? "entry" : "entries"}
                        </span>
                      </div>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dash-section dash-section--phases">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Phases</h2>
              <span className="dash-section__sub">
                Where your energy is going right now
              </span>
            </div>
            <form className="add-form" onSubmit={onCreatePhase}>
              <input
                type="text"
                placeholder="New phase…"
                aria-label="New phase name"
                value={newPhaseName}
                onChange={(e) => setNewPhaseName(e.target.value)}
              />
              <button type="submit" disabled={!newPhaseName.trim()}>
                Add
              </button>
            </form>
          </header>
          {loaded && phases.length === 0 ? (
            <div className="dash-empty">
              <strong>No phases yet</strong>
              <span>Add one above to name the season you're in.</span>
            </div>
          ) : (
            <ul className="phase-list">
              {sortedPhases.map((p) => {
                const active = p.inactiveSince === null;
                const isCurrent = active && latestPhase?.phaseId === p.id;
                const classes = [
                  "phase-card",
                  active ? "" : "phase-card--inactive",
                  isCurrent ? "phase-card--current" : "",
                ]
                  .filter(Boolean)
                  .join(" ");
                return (
                  <li key={p.id} className={classes}>
                    <span className="phase-card__dot" aria-hidden="true" />
                    {editingPhaseId === p.id ? (
                      <input
                        type="text"
                        className="rename-input"
                        value={editingPhaseName}
                        autoFocus
                        onChange={(e) => setEditingPhaseName(e.target.value)}
                        onBlur={commitPhaseEdit}
                        onKeyDown={(e) => {
                          if (e.key === "Enter") {
                            e.preventDefault();
                            commitPhaseEdit();
                          }
                          if (e.key === "Escape") setEditingPhaseId(null);
                        }}
                      />
                    ) : (
                      <button
                        type="button"
                        className="phase-card__name"
                        onClick={() => startPhaseEdit(p)}
                        title="Click to rename"
                      >
                        {p.name}
                      </button>
                    )}
                    {isCurrent && <span className="phase-card__now">Now</span>}
                    <Switch
                      checked={active}
                      onChange={() => onTogglePhaseActive(p)}
                      label={`${p.name} active`}
                    />
                  </li>
                );
              })}
            </ul>
          )}
        </section>

        <section className="dash-section dash-section--journal">
          <header className="dash-section__head">
            <div className="dash-section__title">
              <h2>Journal</h2>
              <span className="dash-section__sub">
                Check-ins, phase changes &amp; brain dumps · last 30 days
              </span>
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
      </div>
    </main>
  );
}

export default Dashboard;
