import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addMetricToPulse,
  createMetric,
  createPulse,
  deletePulse,
  removeMetricFromPulse,
  renameMetric,
  renamePulse,
  reorderPulseMetrics,
  reorderPulses,
  setMetricIcon,
  setPulseIcon,
} from "../../lib/commands";
import { readHiddenPulseIds, setPulseVisible } from "../../lib/pulseVisibility";
import type { Metric } from "../../lib/types";
import { MenuSelect } from "../components/MenuSelect";
import { gripIcon } from "../components/icons";
import { IconPicker, NestIcon } from "../components/PulseIcon";
import { Sparkline } from "../components/Sparkline";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";
import { useListSort } from "../hooks/useListSort";
import { buildMetricSeries } from "../lib/timeline";

const LAST_PULSE_KEY = "nest:last-pulse-id";
const METRIC_RANGES = [
  { key: "30m", label: "30 minutes", seconds: 30 * 60 },
  { key: "1h", label: "1 hour", seconds: 60 * 60 },
  { key: "3h", label: "3 hours", seconds: 3 * 60 * 60 },
  { key: "1d", label: "1 day", seconds: 24 * 60 * 60 },
] as const;

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 6.2h11M8 3.8h4M6 6.2l.7 9h6.6l.7-9M8.2 8.5v4.8m3.6-4.8v4.8" />
    </svg>
  );
}

function MetricTrend({ values }: { values: number[] }) {
  const latest = values[values.length - 1];
  const average = values.length
    ? values.reduce((sum, value) => sum + value, 0) / values.length
    : null;
  return (
    <>
      <div className="pulse-metric__stats">
        {latest === undefined ? (
          <span>No entries yet</span>
        ) : (
          <>
            <span className={`rating-pill rating-pill--v${latest}`}>{latest}</span>
            <span>avg {average?.toFixed(1)}</span>
            <span>{values.length} {values.length === 1 ? "entry" : "entries"}</span>
          </>
        )}
      </div>
      <div className="pulse-metric__graph">
        <Sparkline values={values} />
      </div>
    </>
  );
}

export function MetricsView() {
  const { metrics, pulses, checkIns, mutate } = useDashboardData();
  const [view, setView] = useState<"pulses" | "all">("pulses");
  const [selectedPulseId, setSelectedPulseId] = useState<number | null>(null);
  const [addingPulse, setAddingPulse] = useState(false);
  const [addingMetric, setAddingMetric] = useState(false);
  const [newPulseName, setNewPulseName] = useState("");
  const [newMetricName, setNewMetricName] = useState("");
  const [hiddenPulseIds, setHiddenPulseIds] = useState(readHiddenPulseIds);
  const [metricRange, setMetricRange] = useState<(typeof METRIC_RANGES)[number]["key"]>("1d");
  const [iconPickerOpen, setIconPickerOpen] = useState(false);
  const [metricIconPickerId, setMetricIconPickerId] = useState<number | null>(null);

  const metricRename = useInlineRename({
    rename: renameMetric,
    isUnchanged: (id, name) => metrics.some((metric) => metric.id === id && metric.name === name),
    mutate,
  });
  const pulseRename = useInlineRename({
    rename: renamePulse,
    isUnchanged: (id, name) => pulses.some((pulse) => pulse.id === id && pulse.name === name),
    mutate,
  });

  useEffect(() => {
    if (pulses.some((pulse) => pulse.id === selectedPulseId)) return;
    const remembered = Number(localStorage.getItem(LAST_PULSE_KEY));
    setSelectedPulseId(
      pulses.find((pulse) => pulse.id === remembered)?.id ?? pulses[0]?.id ?? null,
    );
  }, [pulses, selectedPulseId]);

  const selectPulse = (id: number) => {
    setSelectedPulseId(id);
    setIconPickerOpen(false);
    localStorage.setItem(LAST_PULSE_KEY, String(id));
  };
  const togglePulse = (id: number) => {
    setHiddenPulseIds(setPulseVisible(id, hiddenPulseIds.has(id)));
  };
  const selectedPulse = pulses.find((pulse) => pulse.id === selectedPulseId) ?? null;
  const metricsById = useMemo(
    () => new Map(metrics.map((metric) => [metric.id, metric])),
    [metrics],
  );
  const pulseMetrics = selectedPulse
    ? selectedPulse.metricIds.flatMap((id) => {
        const metric = metricsById.get(id);
        return metric ? [metric] : [];
      })
    : [];
  const availableMetrics = selectedPulse
    ? metrics.filter((metric) => !selectedPulse.metricIds.includes(metric.id))
    : [];
  const allSeries = useMemo(() => buildMetricSeries(checkIns), [checkIns]);
  const rangeSeconds = METRIC_RANGES.find((range) => range.key === metricRange)?.seconds ?? 86400;
  const pulseSeries = useMemo(
    () =>
      buildMetricSeries(
        selectedPulse
          ? checkIns.filter(
              (checkIn) =>
                checkIn.pulseId === selectedPulse.id &&
                checkIn.createdAt >= Date.now() / 1000 - rangeSeconds,
            )
          : [],
      ),
    [checkIns, rangeSeconds, selectedPulse],
  );

  const onCreatePulse = async (event: FormEvent) => {
    event.preventDefault();
    const name = newPulseName.trim();
    if (!name) return;
    let createdId: number | null = null;
    const ok = await mutate(async () => {
      createdId = (await createPulse(name)).id;
    });
    if (!ok || createdId === null) return;
    setNewPulseName("");
    setAddingPulse(false);
    selectPulse(createdId);
  };

  const onCreateMetric = async (event: FormEvent) => {
    event.preventDefault();
    const name = newMetricName.trim();
    if (!name) return;
    if (await mutate(() => createMetric(name))) {
      setNewMetricName("");
      setAddingMetric(false);
    }
  };

  const onDeletePulse = () => {
    if (!selectedPulse) return;
    if (!window.confirm(`Delete “${selectedPulse.name}”? Its past check-ins will stay in the journal.`)) {
      return;
    }
    void mutate(() => deletePulse(selectedPulse.id));
  };

  const onSetPulseIcon = async (icon: string) => {
    if (!selectedPulse) return;
    if (await mutate(() => setPulseIcon(selectedPulse.id, icon))) {
      setIconPickerOpen(false);
    }
  };

  const onSetMetricIcon = async (metric: Metric, icon: string) => {
    if (await mutate(() => setMetricIcon(metric.id, icon))) {
      setMetricIconPickerId(null);
    }
  };

  const pulseIds = pulses.map((pulse) => pulse.id);
  const pulseSort = useListSort("pulse", pulseIds, (ids) => {
    void mutate(() => reorderPulses(ids));
  });
  const metricSort = useListSort(
    "metric",
    selectedPulse?.metricIds ?? [],
    (ids) => {
      if (!selectedPulse) return;
      void mutate(() => reorderPulseMetrics(selectedPulse.id, ids));
    },
  );

  return (
    <section className="dash-section dash-section--metrics">
      <header className="dash-section__head metrics-head">
        <nav className="metrics-tabs" role="tablist" aria-label="Metric views">
          <button
            type="button"
            role="tab"
            aria-selected={view === "pulses"}
            onClick={() => setView("pulses")}
          >
            Pulses
          </button>
          <button
            type="button"
            role="tab"
            aria-selected={view === "all"}
            onClick={() => setView("all")}
          >
            Metrics
          </button>
        </nav>
      </header>

      {view === "pulses" ? (
        <div className="pulse-workspace" role="tabpanel">
          <aside className="pulse-sidebar" aria-label="Pulses">
            <div className="pulse-sidebar__head">
              <span>Pulses</span>
              <button
                type="button"
                aria-label="Add pulse"
                aria-expanded={addingPulse}
                onClick={() => setAddingPulse((open) => !open)}
              >
                +
              </button>
            </div>
            {addingPulse && (
              <form className="pulse-composer" onSubmit={onCreatePulse}>
                <label htmlFor="new-pulse-name">New pulse</label>
                <div>
                  <input
                    id="new-pulse-name"
                    autoFocus
                    value={newPulseName}
                    onChange={(event) => setNewPulseName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setAddingPulse(false);
                    }}
                  />
                  <button type="submit" disabled={!newPulseName.trim()} aria-label="Create pulse">
                    Add
                  </button>
                </div>
              </form>
            )}
            {pulses.length ? (
              <ul className="pulse-list">
                {pulses.map((pulse) => {
                  const visible = !hiddenPulseIds.has(pulse.id);
                  return (
                    <li
                      key={pulse.id}
                      data-visible={visible}
                      className={[
                        pulseSort.draggingId === pulse.id ? "is-dragging" : "",
                        pulseSort.overId === pulse.id ? "is-drop-target" : "",
                      ].filter(Boolean).join(" ") || undefined}
                      {...pulseSort.rowProps(pulse.id)}
                    >
                      <span className="reorder-handle" aria-hidden="true">
                        {gripIcon}
                      </span>
                      {pulseRename.editingId === pulse.id ? (
                        <div className="pulse-list__rename">
                          <NestIcon name={pulse.icon} />
                          <input
                            className="rename-input"
                            autoFocus
                            value={pulseRename.draft}
                            onChange={(event) => pulseRename.setDraft(event.target.value)}
                            onBlur={pulseRename.commit}
                            onKeyDown={(event) => {
                              if (event.key === "Enter") pulseRename.commit();
                              if (event.key === "Escape") pulseRename.cancel();
                            }}
                          />
                        </div>
                      ) : (
                        <button
                          className="pulse-list__select"
                          type="button"
                          title="Double-click to rename"
                          aria-label={`${pulse.name}. Double-click or press F2 to rename`}
                          aria-current={pulse.id === selectedPulseId ? "true" : undefined}
                          onClick={() => selectPulse(pulse.id)}
                          onDoubleClick={() => pulseRename.start(pulse.id, pulse.name)}
                          onKeyDown={(event) => {
                            if (event.key === "F2") {
                              event.preventDefault();
                              pulseRename.start(pulse.id, pulse.name);
                            }
                          }}
                        >
                          <NestIcon name={pulse.icon} />
                          <span>{pulse.name}</span>
                        </button>
                      )}
                      <label
                        className="pulse-visibility"
                        title={visible ? "Shown in popup" : "Hidden from popup"}
                      >
                        <input
                          type="checkbox"
                          checked={visible}
                          aria-label={`Show ${pulse.name} in popup`}
                          onChange={() => togglePulse(pulse.id)}
                        />
                        <span aria-hidden="true" />
                      </label>
                    </li>
                  );
                })}
              </ul>
            ) : (
              <p className="pulse-sidebar__empty">No pulses yet.</p>
            )}
          </aside>

          <main className="pulse-detail">
            {selectedPulse ? (
              <>
                <header className="pulse-detail__head">
                  <div className="pulse-icon-control">
                    <button
                      type="button"
                      className="pulse-icon-trigger"
                      aria-label={`Choose icon for ${selectedPulse.name}`}
                      aria-expanded={iconPickerOpen}
                      onClick={() => setIconPickerOpen((open) => !open)}
                    >
                      <NestIcon name={selectedPulse.icon} />
                    </button>
                    {iconPickerOpen && (
                      <IconPicker
                        value={selectedPulse.icon}
                        label={`Icon for ${selectedPulse.name}`}
                        onChange={(icon) => void onSetPulseIcon(icon)}
                      />
                    )}
                  </div>
                  <div className="pulse-detail__actions">
                    <div className="pulse-range" role="group" aria-label="Metric history range">
                      {METRIC_RANGES.map((range) => (
                        <button
                          type="button"
                          key={range.key}
                          aria-label={range.label}
                          aria-pressed={metricRange === range.key}
                          onClick={() => setMetricRange(range.key)}
                        >
                          {range.key}
                        </button>
                      ))}
                    </div>
                    <button
                      type="button"
                      className="pulse-delete"
                      aria-label={`Delete ${selectedPulse.name}`}
                      title="Delete pulse"
                      onClick={onDeletePulse}
                    >
                      <TrashIcon />
                    </button>
                  </div>
                </header>
                <ul className="pulse-metrics">
                  {pulseMetrics.map((metric) => (
                    <li
                      key={metric.id}
                      className={[
                        "pulse-metric",
                        "pulse-metric--ordered",
                        metricSort.draggingId === metric.id ? "is-dragging" : "",
                        metricSort.overId === metric.id ? "is-drop-target" : "",
                      ].filter(Boolean).join(" ")}
                      {...metricSort.rowProps(metric.id)}
                    >
                      <span className="reorder-handle" aria-hidden="true">
                        {gripIcon}
                      </span>
                      <div className="metric-identity">
                        <NestIcon name={metric.icon} />
                        <strong>{metric.name}</strong>
                      </div>
                      <MetricTrend values={pulseSeries.get(metric.id) ?? []} />
                      <button
                        type="button"
                        className="pulse-metric__remove"
                        aria-label={`Remove ${metric.name} from ${selectedPulse.name}`}
                        title="Remove from pulse"
                        onClick={() => void mutate(() => removeMetricFromPulse(selectedPulse.id, metric.id))}
                      >
                        ×
                      </button>
                    </li>
                  ))}
                  <li className="pulse-metric pulse-metric--add">
                    <span className="pulse-metric--add__plus" aria-hidden="true">+</span>
                    <MenuSelect
                      value=""
                      className="pulse-metric--add__select"
                      ariaLabel={`Add metric to ${selectedPulse.name}`}
                      placeholder={availableMetrics.length
                        ? "Add metric"
                        : metrics.length
                          ? "All metrics added"
                          : "Create metrics in Metrics"}
                      options={availableMetrics.map((metric) => ({
                        value: String(metric.id),
                        label: metric.name,
                      }))}
                      onChange={(value) => {
                        void mutate(() => addMetricToPulse(selectedPulse.id, Number(value)));
                      }}
                    />
                  </li>
                </ul>
              </>
            ) : (
              <div className="dash-empty pulse-detail__empty">
                <strong>Create your first pulse</strong>
                <span>A pulse gathers the metrics you want to check together.</span>
              </div>
            )}
          </main>
        </div>
      ) : (
        <div className="all-metrics" role="tabpanel">
          <header className="all-metrics__head">
            <div>
              <h3>All metrics</h3>
              <span>Metrics stay here even when they are not part of a pulse.</span>
            </div>
          </header>
          <ul className="pulse-metrics pulse-metrics--all">
            {metrics.map((metric: Metric) => {
                const membershipCount = pulses.filter((pulse) => pulse.metricIds.includes(metric.id)).length;
                return (
                  <li className="pulse-metric" key={metric.id}>
                    <div className="metric-identity">
                      <div className="metric-icon-control">
                        <button
                          type="button"
                          className="metric-icon-trigger"
                          aria-label={`Choose icon for ${metric.name}`}
                          aria-expanded={metricIconPickerId === metric.id}
                          onClick={() => setMetricIconPickerId((id) => id === metric.id ? null : metric.id)}
                        >
                          <NestIcon name={metric.icon} />
                        </button>
                        {metricIconPickerId === metric.id && (
                          <IconPicker
                            value={metric.icon}
                            label={`Icon for ${metric.name}`}
                            onChange={(icon) => void onSetMetricIcon(metric, icon)}
                          />
                        )}
                      </div>
                      {metricRename.editingId === metric.id ? (
                        <input
                          className="rename-input"
                          autoFocus
                          value={metricRename.draft}
                          onChange={(event) => metricRename.setDraft(event.target.value)}
                          onBlur={metricRename.commit}
                          onKeyDown={(event) => {
                            if (event.key === "Enter") metricRename.commit();
                            if (event.key === "Escape") metricRename.cancel();
                          }}
                        />
                      ) : (
                        <button
                          type="button"
                          className="all-metric__name"
                          title="Rename metric"
                          onClick={() => metricRename.start(metric.id, metric.name)}
                        >
                          {metric.name}
                        </button>
                      )}
                    </div>
                  <span className="all-metric__membership">
                    {membershipCount ? `In ${membershipCount} ${membershipCount === 1 ? "pulse" : "pulses"}` : "Not in a pulse"}
                  </span>
                  <MetricTrend values={allSeries.get(metric.id) ?? []} />
                </li>
              );
            })}
            <li className="pulse-metric pulse-metric--add pulse-metric--create">
              {addingMetric ? (
                <>
                  <span className="pulse-metric--add__plus" aria-hidden="true">+</span>
                  <form className="metric-row-composer" onSubmit={onCreateMetric}>
                    <input
                      autoFocus
                      aria-label="New metric name"
                      placeholder="Metric name"
                      value={newMetricName}
                      onChange={(event) => setNewMetricName(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === "Escape") setAddingMetric(false);
                      }}
                    />
                    <button type="submit" disabled={!newMetricName.trim()}>Add</button>
                  </form>
                </>
              ) : (
                <button
                  type="button"
                  className="metric-row-add"
                  onClick={() => setAddingMetric(true)}
                >
                  <span className="pulse-metric--add__plus" aria-hidden="true">+</span>
                  <span>Add metric</span>
                </button>
              )}
            </li>
          </ul>
        </div>
      )}
    </section>
  );
}
