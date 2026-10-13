import { useMemo, useState, type FormEvent, type ReactNode } from "react";
import {
  addMetricToPulse,
  createMetric,
  createPulse,
  deletePulse,
  listMetricCheckIns,
  removeMetricFromPulse,
  renameMetric,
  renamePulse,
  reorderPulseMetrics,
  reorderPulses,
  setMetricColor,
  setMetricIcon,
  setPulseIcon,
} from "../../lib/commands";
import { resolveMetricColorFromList } from "../../lib/metricColors";
import { readHiddenPulseIds, setPulseVisible } from "../../lib/pulseVisibility";
import type { Metric, MetricCheckInWithRatings, Pulse } from "../../lib/types";
import { DateNavigation } from "../components/DateNavigation";
import { DayAxis, DayTrack } from "../components/DayStrip";
import { MenuSelect } from "../components/MenuSelect";
import { gripIcon } from "../components/icons";
import { IconPickerButton, NestIcon, nestIconLabel } from "../components/PulseIcon";
import { useDashboardData } from "../context/DashboardDataContext";
import { useInlineRename } from "../hooks/useInlineRename";
import { LIST_SORT_IGNORE, useListSort, type SortRowProps } from "../hooks/useListSort";
import { useCurrentTime } from "../hooks/useCurrentTime";
import { useDayRecords } from "../hooks/useDayRecords";
import { selectedDayMs as resolveSelectedDayMs, singleDayPicker, stepSelectedDay } from "../lib/dateNavigation";
import {
  buildMetricDay,
  dayOffset,
  metricDayTicks,
  metricIdsForPulseDay,
  type MetricDayPoint,
  type MetricDayTick,
} from "../lib/metricDay";
import { dayLabel, formatTime, shiftDayMs, startOfDayMs } from "../lib/time";

// Dragging a Pulse starts from its heading; its Metric rows sort on their own.
const PULSE_SORT_IGNORE = `${LIST_SORT_IGNORE}, .metric-group__rows, .rename-input, .metric-group__name`;
const NEW_METRIC_OPTION = "new";

type InlineRename = ReturnType<typeof useInlineRename>;

/** Where an inline "New metric" composer is open: a Pulse id, or the Not in a pulse group. */
type MetricComposerTarget = number | "unpulsed";

function TrashIcon() {
  return (
    <svg viewBox="0 0 20 20" aria-hidden="true" focusable="false">
      <path d="M4.5 6.2h11M8 3.8h4M6 6.2l.7 9h6.6l.7-9M8.2 8.5v4.8m3.6-4.8v4.8" />
    </svg>
  );
}

function MetricDayStrip({
  name,
  points,
  ticks,
  nowOffset,
}: {
  name: string;
  points: MetricDayPoint[];
  ticks: MetricDayTick[];
  nowOffset: number;
}) {
  const label = points.length
    ? `${name}: ${points.map((point) => `${point.value} at ${formatTime(point.createdAt)}`).join(", ")}`
    : `${name}: no check-ins`;
  const stacked = points.some((point) => point.lane > 0);
  return (
    <div className="metric-day" data-stacked={stacked || undefined} role="img" aria-label={label}>
      <DayTrack ticks={ticks} nowOffset={nowOffset}>
        {points.map((point) => (
          <span
            key={point.checkInId}
            className={`metric-day__dot rating-pill rating-pill--v${point.value}`}
            data-lane={point.lane}
            style={{ left: `${point.offset * 100}%` }}
            title={`${formatTime(point.createdAt)} · ${point.value}`}
          >
            {point.value}
          </span>
        ))}
      </DayTrack>
    </div>
  );
}

function RenameableName({
  id,
  name,
  rename,
  className,
}: {
  id: number;
  name: string;
  rename: InlineRename;
  className: string;
}) {
  if (rename.editingId === id) {
    return (
      <input
        className="rename-input"
        autoFocus
        aria-label={`Rename ${name}`}
        value={rename.draft}
        onChange={(event) => rename.setDraft(event.target.value)}
        onBlur={rename.commit}
        onKeyDown={(event) => {
          if (event.key === "Enter") rename.commit();
          if (event.key === "Escape") rename.cancel();
        }}
      />
    );
  }
  return (
    <button
      type="button"
      className={className}
      title="Rename"
      onClick={() => rename.start(id, name)}
    >
      {name}
    </button>
  );
}

function NewMetricComposer({
  onSubmit,
  onCancel,
}: {
  onSubmit: (name: string) => Promise<boolean>;
  onCancel: () => void;
}) {
  const [name, setName] = useState("");
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (trimmed && (await onSubmit(trimmed))) setName("");
  };
  return (
    <li className="metric-row metric-row--add">
      <span className="metric-row__plus" aria-hidden="true">+</span>
      <form className="metric-row-composer" onSubmit={submit}>
        <input
          autoFocus
          aria-label="New metric name"
          placeholder="Metric name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Escape") onCancel();
          }}
        />
        <button type="submit" disabled={!name.trim()}>Add</button>
      </form>
    </li>
  );
}

type DayContext = {
  ticks: MetricDayTick[];
  nowOffset: number;
  dayStartSec: number;
  dayEndSec: number;
};

function MetricReadRow({
  metric,
  color,
  points,
  day,
}: {
  metric: Metric;
  color: string;
  points: MetricDayPoint[];
  day: DayContext;
}) {
  const latest = points[points.length - 1]?.value;
  return (
    <li className="metric-row">
      <div className="metric-row__identity">
        <span title={nestIconLabel(metric.icon)}>
          <NestIcon name={metric.icon} color={color} />
        </span>
        <strong>{metric.name}</strong>
      </div>
      <MetricDayStrip
        name={metric.name}
        points={points}
        ticks={day.ticks}
        nowOffset={day.nowOffset}
      />
      <span
        className="metric-row__latest"
        data-value={latest}
        aria-label={latest === undefined ? "No rating" : `Latest ${latest}`}
      >
        {latest ?? "—"}
      </span>
    </li>
  );
}

function MetricEditIdentity({
  metric,
  color,
  rename,
}: {
  metric: Metric;
  color: string;
  rename: InlineRename;
}) {
  const { mutate } = useDashboardData();
  return (
    <div className="metric-row__identity">
      <IconPickerButton
        controlClassName="metric-icon-control"
        triggerClassName="metric-icon-trigger"
        icon={metric.icon}
        label={metric.name}
        iconColor={color}
        color={metric.color}
        onColorChange={(next) => void mutate(() => setMetricColor(metric.id, next))}
        onChange={(icon) => void mutate(() => setMetricIcon(metric.id, icon))}
      />
      <RenameableName
        id={metric.id}
        name={metric.name}
        rename={rename}
        className="metric-row__name"
      />
    </div>
  );
}

function PulseGroup({
  pulse,
  pulseMetrics,
  allMetrics,
  checkIns,
  day,
  editing,
  visible,
  sortProps,
  sortState,
  pulseRename,
  metricRename,
  composerOpen,
  onComposerOpenChange,
  onToggleVisible,
}: {
  pulse: Pulse;
  pulseMetrics: Metric[];
  allMetrics: Metric[];
  checkIns: MetricCheckInWithRatings[];
  day: DayContext;
  editing: boolean;
  visible: boolean;
  sortProps: SortRowProps | null;
  sortState: string;
  pulseRename: InlineRename;
  metricRename: InlineRename;
  composerOpen: boolean;
  onComposerOpenChange: (open: boolean) => void;
  onToggleVisible: () => void;
}) {
  const { mutate } = useDashboardData();
  const pointsByMetric = useMemo(
    () => buildMetricDay(checkIns, day.dayStartSec, day.dayEndSec),
    [checkIns, day.dayStartSec, day.dayEndSec],
  );
  const dayMetrics = useMemo(() => {
    const metricsById = new Map(allMetrics.map((metric) => [metric.id, metric]));
    return metricIdsForPulseDay(pulse.metricIds, checkIns).flatMap((id) => {
      const metric = metricsById.get(id);
      return metric ? [metric] : [];
    });
  }, [allMetrics, pulse.metricIds, checkIns]);
  const metricSort = useListSort(`metric-${pulse.id}`, pulse.metricIds, (ids) => {
    void mutate(() => reorderPulseMetrics(pulse.id, ids));
  });
  const availableMetrics = allMetrics.filter((metric) => !pulse.metricIds.includes(metric.id));

  const onDelete = () => {
    if (!window.confirm(`Delete “${pulse.name}”? Its past Metric check-ins will stay in Timeline.`)) {
      return;
    }
    void mutate(() => deletePulse(pulse.id));
  };

  const onCreateMetric = (name: string) =>
    mutate(async () => {
      const metric = await createMetric(name);
      await addMetricToPulse(pulse.id, metric.id);
    }).then((ok) => {
      if (ok) onComposerOpenChange(false);
      return ok;
    });

  return (
    <section
      className={["metric-group", sortState].filter(Boolean).join(" ")}
      aria-label={pulse.name}
      {...(sortProps ?? {})}
    >
      <header className="metric-group__head">
        {editing ? (
          <>
            <span className="reorder-handle" aria-hidden="true">{gripIcon}</span>
            <IconPickerButton
              key={pulse.id}
              controlClassName="metric-icon-control"
              triggerClassName="metric-icon-trigger"
              icon={pulse.icon}
              label={pulse.name}
              onChange={(icon) => void mutate(() => setPulseIcon(pulse.id, icon))}
            />
            <RenameableName
              id={pulse.id}
              name={pulse.name}
              rename={pulseRename}
              className="metric-group__name"
            />
            <label className="metric-group__popup">
              <span>Show in popup</span>
              <span className="pulse-visibility">
                <input type="checkbox" checked={visible} onChange={onToggleVisible} />
                <span aria-hidden="true" />
              </span>
            </label>
            <button
              type="button"
              className="metric-group__delete"
              aria-label={`Delete ${pulse.name}`}
              title="Delete pulse"
              onClick={onDelete}
            >
              <TrashIcon />
            </button>
          </>
        ) : (
          <>
            <span className="metric-group__icon" title={nestIconLabel(pulse.icon)}>
              <NestIcon name={pulse.icon} />
            </span>
            <h2>{pulse.name}</h2>
            {visible ? null : <span className="metric-group__note">Hidden from popup</span>}
          </>
        )}
      </header>
      <ul className="metric-group__rows">
        {editing ? (
          <>
            {pulseMetrics.map((metric) => (
              <li
                key={metric.id}
                className={[
                  "metric-row",
                  "metric-row--edit",
                  metricSort.draggingId === metric.id ? "is-dragging" : "",
                  metricSort.overId === metric.id ? "is-drop-target" : "",
                ].filter(Boolean).join(" ")}
                {...metricSort.rowProps(metric.id)}
              >
                <span className="reorder-handle" aria-hidden="true">{gripIcon}</span>
                <MetricEditIdentity
                  metric={metric}
                  color={resolveMetricColorFromList(allMetrics, metric.id)}
                  rename={metricRename}
                />
                <button
                  type="button"
                  className="metric-row__remove"
                  aria-label={`Remove ${metric.name} from ${pulse.name}`}
                  title="Remove from pulse"
                  onClick={() => void mutate(() => removeMetricFromPulse(pulse.id, metric.id))}
                >
                  ×
                </button>
              </li>
            ))}
            {composerOpen ? (
              <NewMetricComposer
                onSubmit={onCreateMetric}
                onCancel={() => onComposerOpenChange(false)}
              />
            ) : (
              <li className="metric-row metric-row--add">
                <span className="metric-row__plus" aria-hidden="true">+</span>
                <MenuSelect
                  value=""
                  className="metric-row__add-select"
                  ariaLabel={`Add metric to ${pulse.name}`}
                  placeholder="Add metric"
                  options={[
                    ...availableMetrics.map((metric) => ({
                      value: String(metric.id),
                      label: metric.name,
                    })),
                    { value: NEW_METRIC_OPTION, label: "New metric…" },
                  ]}
                  onChange={(value) => {
                    if (value === NEW_METRIC_OPTION) {
                      onComposerOpenChange(true);
                      return;
                    }
                    void mutate(() => addMetricToPulse(pulse.id, Number(value)));
                  }}
                />
              </li>
            )}
          </>
        ) : dayMetrics.length ? (
          dayMetrics.map((metric) => (
            <MetricReadRow
              key={metric.id}
              metric={metric}
              color={resolveMetricColorFromList(allMetrics, metric.id)}
              points={pointsByMetric.get(metric.id) ?? []}
              day={day}
            />
          ))
        ) : (
          <li className="metric-row metric-row--quiet">No metrics yet</li>
        )}
      </ul>
    </section>
  );
}

function UnpulsedGroup({ children }: { children: ReactNode }) {
  return (
    <section className="metric-group" aria-label="Not in a pulse">
      <header className="metric-group__head">
        <h2 className="metric-group__quiet-title">Not in a pulse</h2>
      </header>
      <ul className="metric-group__rows">{children}</ul>
    </section>
  );
}

export function MetricsView() {
  const { metrics, pulses, checkIns, mutate } = useDashboardData();
  const [anchorMs, setAnchorMs] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [addingPulse, setAddingPulse] = useState(false);
  const [newPulseName, setNewPulseName] = useState("");
  const [metricComposer, setMetricComposer] = useState<MetricComposerTarget | null>(null);
  const [hiddenPulseIds, setHiddenPulseIds] = useState(readHiddenPulseIds);
  const nowMs = useCurrentTime();

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

  const dayStartMs = resolveSelectedDayMs(anchorMs, nowMs);
  const dayEndMs = shiftDayMs(dayStartMs, 1);
  const todayMs = startOfDayMs(nowMs / 1000);
  const { records: dayCheckIns, loaded: dayLoaded } = useDayRecords(
    dayStartMs,
    nowMs,
    checkIns,
    listMetricCheckIns,
  );
  const day: DayContext = useMemo(
    () => ({
      ticks: metricDayTicks(dayStartMs, dayEndMs),
      nowOffset: dayOffset(nowMs / 1000, dayStartMs / 1000, dayEndMs / 1000),
      dayStartSec: dayStartMs / 1000,
      dayEndSec: dayEndMs / 1000,
    }),
    [dayStartMs, dayEndMs, nowMs],
  );
  const selectedCheckIns = useMemo(
    () =>
      dayCheckIns.filter(
        (checkIn) => checkIn.createdAt >= day.dayStartSec && checkIn.createdAt < day.dayEndSec,
      ),
    [dayCheckIns, day.dayStartSec, day.dayEndSec],
  );
  const checkInsByPulse = useMemo(() => {
    const byPulse = new Map<number, MetricCheckInWithRatings[]>();
    for (const checkIn of selectedCheckIns) {
      if (checkIn.pulseId === null) continue;
      byPulse.set(checkIn.pulseId, [...(byPulse.get(checkIn.pulseId) ?? []), checkIn]);
    }
    return byPulse;
  }, [selectedCheckIns]);
  // A Metric outside every Pulse can still hold the day's ratings from a Pulse it left.
  const unpulsedPoints = useMemo(
    () => buildMetricDay(selectedCheckIns, day.dayStartSec, day.dayEndSec),
    [selectedCheckIns, day.dayStartSec, day.dayEndSec],
  );

  const metricsById = useMemo(
    () => new Map(metrics.map((metric) => [metric.id, metric])),
    [metrics],
  );
  const pulsedMetricIds = new Set(pulses.flatMap((pulse) => pulse.metricIds));
  const unpulsedMetrics = metrics.filter((metric) => !pulsedMetricIds.has(metric.id));

  const pulseSort = useListSort(
    "pulse",
    pulses.map((pulse) => pulse.id),
    (ids) => void mutate(() => reorderPulses(ids)),
    PULSE_SORT_IGNORE,
  );

  const onCreatePulse = async (event: FormEvent) => {
    event.preventDefault();
    const name = newPulseName.trim();
    if (!name) return;
    if (await mutate(() => createPulse(name))) {
      setNewPulseName("");
      setAddingPulse(false);
    }
  };

  const onCreateUnpulsedMetric = async (name: string) => {
    const ok = await mutate(() => createMetric(name));
    if (ok) setMetricComposer(null);
    return ok;
  };

  const toggleEditing = () => {
    // Leaving Edit drops half-typed composers so they cannot reappear stale later.
    setAddingPulse(false);
    setMetricComposer(null);
    setEditing(!editing);
  };

  const startFirstPulse = () => {
    setEditing(true);
    setAddingPulse(true);
  };

  const isEmpty = !pulses.length && !metrics.length;

  return (
    <section className="dash-section dash-section--metrics">
      <header className="dash-section__head">
        <DateNavigation
          label={dayLabel(dayStartMs / 1000, nowMs)}
          unit="day"
          canGoNext={dayStartMs < todayMs}
          onPrevious={() => setAnchorMs((current) => stepSelectedDay(current, -1, nowMs))}
          onNext={() => setAnchorMs((current) => stepSelectedDay(current, 1, nowMs))}
          onToday={() => setAnchorMs(null)}
          picker={singleDayPicker(dayStartMs, nowMs, setAnchorMs)}
        />
        {isEmpty && !editing ? null : (
          <button
            type="button"
            className="metrics-edit-toggle"
            aria-pressed={editing}
            onClick={toggleEditing}
          >
            {editing ? "Done" : "Edit"}
          </button>
        )}
      </header>

      <div
        className="metrics-board"
        data-editing={editing || undefined}
        aria-busy={!dayLoaded}
      >
        {!dayLoaded && !editing ? (
          <div className="dash-empty metrics-board__empty" role="status">
            <span>Loading Metric check-ins…</span>
          </div>
        ) : isEmpty && !editing ? (
          <div className="dash-empty metrics-board__empty">
            <strong>Create your first pulse</strong>
            <span>A pulse gathers the metrics you want to check together.</span>
            <button type="button" className="btn-accent" onClick={startFirstPulse}>
              Add pulse
            </button>
          </div>
        ) : (
          <>
            {editing ? null : <DayAxis ticks={day.ticks} />}
            {pulses.map((pulse) => (
              <PulseGroup
                key={pulse.id}
                pulse={pulse}
                pulseMetrics={pulse.metricIds.flatMap((id) => {
                  const metric = metricsById.get(id);
                  return metric ? [metric] : [];
                })}
                allMetrics={metrics}
                checkIns={checkInsByPulse.get(pulse.id) ?? []}
                day={day}
                editing={editing}
                visible={!hiddenPulseIds.has(pulse.id)}
                sortProps={editing ? pulseSort.rowProps(pulse.id) : null}
                sortState={[
                  pulseSort.draggingId === pulse.id ? "is-dragging" : "",
                  pulseSort.overId === pulse.id ? "is-drop-target" : "",
                ].filter(Boolean).join(" ")}
                pulseRename={pulseRename}
                metricRename={metricRename}
                composerOpen={metricComposer === pulse.id}
                onComposerOpenChange={(open) => setMetricComposer(open ? pulse.id : null)}
                onToggleVisible={() =>
                  setHiddenPulseIds(setPulseVisible(pulse.id, hiddenPulseIds.has(pulse.id)))
                }
              />
            ))}
            {unpulsedMetrics.length || editing ? (
              <UnpulsedGroup>
                {unpulsedMetrics.map((metric) => {
                  const color = resolveMetricColorFromList(metrics, metric.id);
                  return editing ? (
                    <li key={metric.id} className="metric-row metric-row--edit metric-row--unordered">
                      <MetricEditIdentity metric={metric} color={color} rename={metricRename} />
                    </li>
                  ) : (
                    <MetricReadRow
                      key={metric.id}
                      metric={metric}
                      color={color}
                      points={unpulsedPoints.get(metric.id) ?? []}
                      day={day}
                    />
                  );
                })}
                {editing ? (
                  metricComposer === "unpulsed" ? (
                    <NewMetricComposer
                      onSubmit={onCreateUnpulsedMetric}
                      onCancel={() => setMetricComposer(null)}
                    />
                  ) : (
                    <li className="metric-row metric-row--add">
                      <button
                        type="button"
                        className="metric-row__add-button"
                        onClick={() => setMetricComposer("unpulsed")}
                      >
                        <span className="metric-row__plus" aria-hidden="true">+</span>
                        <span>New metric</span>
                      </button>
                    </li>
                  )
                ) : null}
              </UnpulsedGroup>
            ) : null}
            {editing ? (
              addingPulse ? (
                <form className="metrics-new-pulse metric-row-composer" onSubmit={onCreatePulse}>
                  <input
                    autoFocus
                    aria-label="New pulse name"
                    placeholder="Pulse name"
                    value={newPulseName}
                    onChange={(event) => setNewPulseName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === "Escape") setAddingPulse(false);
                    }}
                  />
                  <button type="submit" disabled={!newPulseName.trim()}>Add</button>
                </form>
              ) : (
                <button
                  type="button"
                  className="metrics-new-pulse metric-row__add-button"
                  onClick={() => setAddingPulse(true)}
                >
                  <span className="metric-row__plus" aria-hidden="true">+</span>
                  <span>New pulse</span>
                </button>
              )
            ) : null}
          </>
        )}
      </div>
    </section>
  );
}
