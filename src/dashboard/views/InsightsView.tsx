import { useEffect, useMemo, useState } from "react";
import {
  listMetricCheckIns,
  listPhaseCheckIns,
  listTaskStatusEvents,
} from "../../lib/commands";
import type {
  MetricCheckInWithRatings,
  PhaseCheckIn,
  TaskStatusEvent,
} from "../../lib/types";
import { useDashboardData } from "../context/DashboardDataContext";
import {
  buildActivityBuckets,
  comparisonText,
  countCheckIns,
  INSIGHT_RANGES,
  latestCompletions,
  metricInsights,
  notableObservations,
  phaseDurations,
  summarizePeriod,
  type InsightRangeKey,
} from "../lib/insights";
import { scopeMatches } from "../lib/scope";

const formatScore = (value: number, count: number) =>
  count === 0 ? "—" : String(value);

const formatDateTime = (seconds: number, range: InsightRangeKey) =>
  new Date(seconds * 1000).toLocaleString(undefined, {
    month: range === "24h" ? undefined : "short",
    day: range === "24h" ? undefined : "numeric",
    hour: "numeric",
    minute: "2-digit",
  });

const formatDuration = (seconds: number) => {
  const hours = seconds / 3600;
  return hours < 1 ? "<1h" : `${Math.round(hours)}h`;
};

export function InsightsView() {
  const { tasks, metrics, phases, scopeTree, loaded, setError } =
    useDashboardData();
  const [range, setRange] = useState<InsightRangeKey>("7d");
  const [selectedScope, setSelectedScope] = useState<string | null>(null);
  const [events, setEvents] = useState<TaskStatusEvent[]>([]);
  const [metricCheckIns, setMetricCheckIns] = useState<
    MetricCheckInWithRatings[]
  >([]);
  const [phaseCheckIns, setPhaseCheckIns] = useState<PhaseCheckIn[]>([]);
  const [insightsLoaded, setInsightsLoaded] = useState(false);

  const rangeDefinition =
    INSIGHT_RANGES.find((candidate) => candidate.key === range) ??
    INSIGHT_RANGES[1];
  const { now, current, previous } = useMemo(() => {
    const anchoredNow = Math.floor(Date.now() / 1000);
    const to = anchoredNow + 1;
    const nextCurrent = {
      from: to - rangeDefinition.seconds,
      to,
    };
    return {
      now: anchoredNow,
      current: nextCurrent,
      previous: {
        from: nextCurrent.from - rangeDefinition.seconds,
        to: nextCurrent.from,
      },
    };
  }, [rangeDefinition.seconds]);

  useEffect(() => {
    let cancelled = false;
    setInsightsLoaded(false);
    setEvents([]);
    setMetricCheckIns([]);
    setPhaseCheckIns([]);
    Promise.all([
      listTaskStatusEvents(previous.from, current.to),
      listMetricCheckIns(previous.from, current.to),
      listPhaseCheckIns(0, current.to),
    ])
      .then(([nextEvents, nextMetrics, nextPhases]) => {
        if (cancelled) return;
        setEvents(nextEvents);
        setMetricCheckIns(nextMetrics);
        setPhaseCheckIns(nextPhases);
      })
      .catch((error) => {
        if (!cancelled) setError(String(error));
      })
      .finally(() => {
        if (!cancelled) setInsightsLoaded(true);
      });
    return () => {
      cancelled = true;
    };
  }, [range, previous.from, current.to, setError]);

  const currentCompletions = useMemo(
    () =>
      latestCompletions(
        tasks,
        events,
        current,
        selectedScope,
        phaseCheckIns,
      ),
    [tasks, events, current.from, current.to, selectedScope, phaseCheckIns],
  );
  const previousCompletions = useMemo(
    () =>
      latestCompletions(
        tasks,
        events,
        previous,
        selectedScope,
        phaseCheckIns,
      ),
    [tasks, events, previous.from, previous.to, selectedScope, phaseCheckIns],
  );
  const currentSummary = useMemo(
    () => summarizePeriod(currentCompletions),
    [currentCompletions],
  );
  const previousSummary = useMemo(
    () => summarizePeriod(previousCompletions),
    [previousCompletions],
  );
  const metricRows = useMemo(
    () => metricInsights(metrics, metricCheckIns, current, previous),
    [
      metrics,
      metricCheckIns,
      current.from,
      current.to,
      previous.from,
      previous.to,
    ],
  );
  const phaseRows = useMemo(
    () => phaseDurations(phaseCheckIns, current),
    [phaseCheckIns, current.from, current.to],
  );
  const activity = useMemo(
    () => buildActivityBuckets(currentCompletions, current, range),
    [currentCompletions, current.from, current.to, range],
  );
  const observations = useMemo(
    () =>
      notableObservations(
        currentSummary,
        previousSummary,
        metricRows,
        phases,
      ),
    [currentSummary, previousSummary, metricRows, phases],
  );

  const currentCheckIns = countCheckIns(metricCheckIns, current);
  const previousCheckIns = countCheckIns(metricCheckIns, previous);
  const maxActivity = Math.max(1, ...activity.map((bucket) => bucket.count));
  const trackedPhaseSeconds = phaseRows.reduce(
    (sum, phase) => sum + phase.seconds,
    0,
  );
  const phaseById = new Map(phases.map((phase) => [phase.id, phase]));
  const activeTasks = tasks.filter(
    (task) =>
      task.status === "active" && scopeMatches(task.scope, selectedScope),
  );
  const sevenDaysAgo = now - 7 * 24 * 60 * 60;
  const longActive = activeTasks
    .filter((task) => task.createdAt < sevenDaysAgo)
    .sort((a, b) => a.createdAt - b.createdAt);
  const pauseCounts = new Map<number, number>();
  for (const event of events) {
    if (
      event.toStatus === "paused" &&
      event.createdAt >= current.from &&
      event.createdAt < current.to
    ) {
      pauseCounts.set(event.taskId, (pauseCounts.get(event.taskId) ?? 0) + 1);
    }
  }
  const repeatedlyPaused = tasks
    .filter(
      (task) =>
        scopeMatches(task.scope, selectedScope) &&
        (pauseCounts.get(task.id) ?? 0) >= 2,
    )
    .sort(
      (a, b) => (pauseCounts.get(b.id) ?? 0) - (pauseCounts.get(a.id) ?? 0),
    );
  const ready = loaded && insightsLoaded;

  return (
    <section className="insights" aria-busy={!ready}>
      <header className="insights__head">
        <div>
          <p className="insights__eyebrow">Personal retrospective</p>
          <h2>What the days held</h2>
          <p>
            A factual look at completed work, check-ins, and where your time
            seemed to go.
          </p>
        </div>
        <div className="insights__filters">
          <div className="insights-range" aria-label="Insight period">
            {INSIGHT_RANGES.map((candidate) => (
              <button
                key={candidate.key}
                type="button"
                className={
                  range === candidate.key
                    ? "insights-range__btn insights-range__btn--active"
                    : "insights-range__btn"
                }
                aria-pressed={range === candidate.key}
                onClick={() => setRange(candidate.key)}
              >
                {candidate.key}
              </button>
            ))}
          </div>
          <label className="insights-scope">
            <span>Scope</span>
            <select
              value={selectedScope ?? ""}
              onChange={(event) => setSelectedScope(event.target.value || null)}
            >
              <option value="">All tasks</option>
              {[...scopeTree.paths].sort().map((scope) => (
                <option key={scope} value={scope}>
                  {scope}
                </option>
              ))}
            </select>
          </label>
        </div>
      </header>

      {!ready ? (
        <div className="insights__loading">Gathering the record…</div>
      ) : (
        <>
          <div className="insights-ledger">
            <article className="insights-ledger__primary">
              <span>Completed</span>
              <strong>{currentSummary.completions.length}</strong>
              <small>
                {comparisonText(
                  currentSummary.completions.length,
                  previousSummary.completions.length,
                )}
              </small>
            </article>
            <article>
              <span>Value delivered</span>
              <strong>
                {formatScore(
                  currentSummary.value,
                  currentSummary.valueScoredTasks,
                )}
              </strong>
              <small>
                Current scores · {currentSummary.valueScoredTasks} scored
              </small>
            </article>
            <article>
              <span>Effort completed</span>
              <strong>
                {formatScore(
                  currentSummary.effort,
                  currentSummary.effortScoredTasks,
                )}
              </strong>
              <small>Current task scores</small>
            </article>
            <article>
              <span>Metric check-ins</span>
              <strong>{currentCheckIns}</strong>
              <small>{comparisonText(currentCheckIns, previousCheckIns)}</small>
            </article>
          </div>

          <div className="insights-spread">
            <section className="insights-panel insights-panel--activity">
              <header>
                <div>
                  <h3>Completion rhythm</h3>
                  <p>
                    {range === "24h"
                      ? "Hour by hour"
                      : range === "90d"
                        ? "Three-day intervals"
                        : "Day by day"}
                  </p>
                </div>
                <span>{rangeDefinition.label}</span>
              </header>
              <div className="activity-chart" aria-label="Task completions over time">
                {activity.map((bucket, index) => (
                  <div
                    className="activity-chart__bucket"
                    key={bucket.from}
                    title={`${bucket.count} completed · ${formatDateTime(bucket.from, range)}`}
                  >
                    <span
                      style={{
                        transform: `scaleY(${bucket.count / maxActivity})`,
                      }}
                    />
                    {(index === 0 ||
                      index === activity.length - 1 ||
                      index === Math.floor(activity.length / 2)) && (
                      <small>
                        {range === "24h"
                          ? new Date(bucket.from * 1000).toLocaleTimeString(
                              undefined,
                              { hour: "numeric" },
                            )
                          : new Date(bucket.from * 1000).toLocaleDateString(
                              undefined,
                              { month: "short", day: "numeric" },
                            )}
                      </small>
                    )}
                  </div>
                ))}
              </div>
            </section>

            <section className="insights-panel insights-panel--notes">
              <header>
                <div>
                  <h3>What stands out</h3>
                  <p>Direct comparisons from this record</p>
                </div>
              </header>
              {observations.length ? (
                <ol className="insights-notes">
                  {observations.map((observation) => (
                    <li key={observation}>{observation}</li>
                  ))}
                </ol>
              ) : (
                <p className="insights-quiet">
                  There is not enough activity yet for a useful comparison.
                </p>
              )}
            </section>
          </div>

          <div className="insights-columns">
            <section className="insights-panel">
              <header>
                <div>
                  <h3>How it felt</h3>
                  <p>Averages with the previous period beside them</p>
                </div>
              </header>
              {metricRows.length ? (
                <ul className="insights-metrics">
                  {metricRows.map((row) => {
                    const change =
                      row.average !== null && row.previousAverage !== null
                        ? row.average - row.previousAverage
                        : null;
                    return (
                      <li key={row.metric.id}>
                        <div>
                          <strong>{row.metric.name}</strong>
                          <span>
                            {row.entries} {row.entries === 1 ? "entry" : "entries"}
                          </span>
                        </div>
                        <span className="insights-metrics__average">
                          {row.average?.toFixed(1) ?? "—"}
                        </span>
                        <small>
                          {change === null
                            ? "No prior baseline"
                            : `prev ${row.previousAverage?.toFixed(1)} · ${change > 0 ? "+" : ""}${change.toFixed(1)}`}
                        </small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="insights-quiet">No metric entries in this period.</p>
              )}
            </section>

            <section className="insights-panel">
              <header>
                <div>
                  <h3>Time by phase</h3>
                  <p>Estimated between phase check-ins</p>
                </div>
              </header>
              {phaseRows.length ? (
                <ul className="insights-phases">
                  {phaseRows.map((row) => {
                    const phase = phaseById.get(row.phaseId);
                    const share =
                      trackedPhaseSeconds > 0
                        ? row.seconds / trackedPhaseSeconds
                        : 0;
                    return (
                      <li key={row.phaseId}>
                        <div>
                          <strong>{phase?.name ?? `Phase ${row.phaseId}`}</strong>
                          <span>{formatDuration(row.seconds)}</span>
                        </div>
                        <span className="insights-phases__track">
                          <i style={{ transform: `scaleX(${share})` }} />
                        </span>
                        <small>{Math.round(share * 100)}%</small>
                      </li>
                    );
                  })}
                </ul>
              ) : (
                <p className="insights-quiet">
                  No phase was recorded during this period.
                </p>
              )}
            </section>
          </div>

          <section className="insights-panel insights-panel--record">
            <header>
              <div>
                <h3>The completed record</h3>
                <p>
                  Uses each task’s current scope, value, and effort
                </p>
              </div>
              <span>{currentCompletions.length} tasks</span>
            </header>
            {currentCompletions.length ? (
              <ol className="insights-record">
                {currentCompletions.map(({ task, at, phaseId }) => (
                  <li key={task.id}>
                    <time dateTime={new Date(at * 1000).toISOString()}>
                      {formatDateTime(at, range)}
                    </time>
                    <div>
                      <strong>{task.title}</strong>
                      <span>
                        {[
                          task.scope,
                          phaseId
                            ? phaseById.get(phaseId)?.name ??
                              `Phase ${phaseId}`
                            : null,
                        ]
                          .filter(Boolean)
                          .join(" · ") || "No scope or phase"}
                      </span>
                    </div>
                    <small>
                      {task.value ? `V${task.value}` : "V—"}{" "}
                      {task.effort ? `E${task.effort}` : "E—"}
                    </small>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="insights-quiet">
                No currently completed tasks landed in this period.
              </p>
            )}
          </section>

          {(longActive.length > 0 || repeatedlyPaused.length > 0) && (
            <section className="insights-friction">
              <div>
                <span>Still carrying</span>
                <strong>{longActive.length}</strong>
                <p>Active tasks created more than seven days ago.</p>
              </div>
              <div>
                <span>Interrupted</span>
                <strong>{repeatedlyPaused.length}</strong>
                <p>Tasks paused at least twice during this period.</p>
              </div>
            </section>
          )}

          <p className="insights__footnote">
            Phase time is estimated between check-ins. These are descriptions,
            not claims that one signal caused another.
          </p>
        </>
      )}
    </section>
  );
}
