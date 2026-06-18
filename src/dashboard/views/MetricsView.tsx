import { useMemo, useState, type FormEvent } from "react";
import { createMetric, renameMetric, setMetricActive } from "../../lib/commands";
import type { Metric } from "../../lib/types";
import { Sparkline } from "../components/Sparkline";
import { Switch } from "../components/Switch";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";
import { buildMetricSeries } from "../lib/timeline";

export function MetricsView() {
  const { metrics, checkIns, loaded, mutate } = useDashboardData();
  const [newMetricName, setNewMetricName] = useState("");
  const rename = useInlineRename({
    rename: renameMetric,
    isUnchanged: (id, next) => {
      const current = metrics.find((m) => m.id === id);
      return current != null && current.name === next;
    },
    mutate,
  });

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

  const seriesByMetric = useMemo(() => buildMetricSeries(checkIns), [checkIns]);

  const onCreate = async (e: FormEvent) => {
    e.preventDefault();
    const name = newMetricName.trim();
    if (!name) return;
    if (await mutate(() => createMetric(name))) setNewMetricName("");
  };

  const onToggleActive = (m: Metric) =>
    void mutate(() => setMetricActive(m.id, m.inactiveSince !== null));

  return (
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
            const latest = values.length ? values[values.length - 1] : null;
            const avg = values.length
              ? values.reduce((sum, v) => sum + v, 0) / values.length
              : null;
            return (
              <li
                key={m.id}
                className={`metric-card${active ? "" : " metric-card--inactive"}`}
              >
                <div className="metric-card__top">
                  {rename.editingId === m.id ? (
                    <input
                      type="text"
                      className="rename-input"
                      value={rename.draft}
                      autoFocus
                      onChange={(e) => rename.setDraft(e.target.value)}
                      onBlur={rename.commit}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") {
                          e.preventDefault();
                          rename.commit();
                        }
                        if (e.key === "Escape") rename.cancel();
                      }}
                    />
                  ) : (
                    <button
                      type="button"
                      className="metric-card__name"
                      onClick={() => rename.start(m.id, m.name)}
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
                      <span className={`rating-pill rating-pill--v${latest}`}>
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
  );
}
