import { useEffect, useState } from "react";
import { listen } from "@tauri-apps/api/event";
import {
  createPhase,
  createMetric,
  deleteCheckIn,
  listCheckIns,
  listMetrics,
  listPhases,
  renamePhase,
  renameMetric,
  setPhaseActive,
  setMetricActive,
} from "../lib/commands";
import type { CheckInWithRatings, Metric, Phase } from "../lib/types";
import "./Dashboard.css";

const THIRTY_DAYS_SECONDS = 30 * 24 * 60 * 60;

function Dashboard() {
  const [metrics, setMetrics] = useState<Metric[]>([]);
  const [phases, setPhases] = useState<Phase[]>([]);
  const [checkIns, setCheckIns] = useState<CheckInWithRatings[]>([]);
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
      const [m, p, ci] = await Promise.all([
        listMetrics(true),
        listPhases(true),
        listCheckIns(now - THIRTY_DAYS_SECONDS, now + 1),
      ]);
      setMetrics(m);
      setPhases(p);
      setCheckIns(ci);
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
      await deleteCheckIn(id);
      await reload();
    } catch (e) {
      setError(String(e));
    }
  };

  const metricById = (id: number) => metrics.find((m) => m.id === id);

  const formatTime = (ts: number) =>
    new Date(ts * 1000).toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });

  return (
    <main className="dashboard">
      <section className="dashboard__section">
        <h2 className="dashboard__heading">Metrics</h2>
        <form className="metric-create" onSubmit={onCreate}>
          <input
            type="text"
            placeholder="Add a metric…"
            value={newMetricName}
            onChange={(e) => setNewMetricName(e.target.value)}
          />
          <button type="submit" disabled={!newMetricName.trim()}>
            Add
          </button>
        </form>
        {loaded && metrics.length === 0 ? (
          <p className="dashboard__empty">No metrics yet. Add one above.</p>
        ) : (
          <ul className="metric-list">
            {metrics.map((m) => {
              const active = m.inactiveSince === null;
              return (
                <li
                  key={m.id}
                  className={`metric-item${active ? "" : " metric-item--inactive"}`}
                >
                  {editingId === m.id ? (
                    <input
                      type="text"
                      className="metric-item__rename"
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
                      className="metric-item__name"
                      onClick={() => startEdit(m)}
                      title="Click to rename"
                    >
                      {m.name}
                    </button>
                  )}
                  <label className="metric-item__toggle">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onToggleActive(m)}
                    />
                    <span>{active ? "Active" : "Paused"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard__section">
        <h2 className="dashboard__heading">Phases</h2>
        <form className="phase-create" onSubmit={onCreatePhase}>
          <input
            type="text"
            placeholder="Add a phase…"
            value={newPhaseName}
            onChange={(e) => setNewPhaseName(e.target.value)}
          />
          <button type="submit" disabled={!newPhaseName.trim()}>
            Add
          </button>
        </form>
        {loaded && phases.length === 0 ? (
          <p className="dashboard__empty">No phases yet. Add one above.</p>
        ) : (
          <ul className="phase-list">
            {phases.map((p) => {
              const active = p.inactiveSince === null;
              return (
                <li
                  key={p.id}
                  className={`phase-item${active ? "" : " phase-item--inactive"}`}
                >
                  {editingPhaseId === p.id ? (
                    <input
                      type="text"
                      className="phase-item__rename"
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
                      className="phase-item__name"
                      onClick={() => startPhaseEdit(p)}
                      title="Click to rename"
                    >
                      {p.name}
                    </button>
                  )}
                  <label className="phase-item__toggle">
                    <input
                      type="checkbox"
                      checked={active}
                      onChange={() => onTogglePhaseActive(p)}
                    />
                    <span>{active ? "Active" : "Paused"}</span>
                  </label>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section className="dashboard__section">
        <h2 className="dashboard__heading">Recent check-ins</h2>
        {loaded && checkIns.length === 0 ? (
          <p className="dashboard__empty">
            No check-ins in the last 30 days. Press ⌘⇧E to log one.
          </p>
        ) : (
          <ul className="check-in-list">
            {checkIns.map((ci) => (
              <li key={ci.id} className="check-in">
                <div className="check-in__head">
                  <time className="check-in__time">
                    {formatTime(ci.createdAt)}
                  </time>
                  <button
                    type="button"
                    className="check-in__delete"
                    onClick={() => onDeleteCheckIn(ci.id)}
                    aria-label="Delete check-in"
                    title="Delete"
                  >
                    ×
                  </button>
                </div>
                <ul className="check-in__ratings">
                  {ci.ratings.map((r) => {
                    const metric = metricById(r.metricId);
                    return (
                      <li key={r.metricId} className="check-in__rating">
                        <span className="check-in__metric">
                          {metric?.name ?? `Metric ${r.metricId}`}
                        </span>
                        <span className="check-in__value">{r.value}</span>
                        {r.note && (
                          <span className="check-in__rating-note">{r.note}</span>
                        )}
                      </li>
                    );
                  })}
                </ul>
                {ci.note && <p className="check-in__note">{ci.note}</p>}
              </li>
            ))}
          </ul>
        )}
      </section>

      {error && <div className="dashboard__error">{error}</div>}
    </main>
  );
}

export default Dashboard;
