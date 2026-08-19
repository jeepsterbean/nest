import type { CSSProperties } from "react";
import type { Task } from "../../lib/types";
import type {
  InsightDay,
  InsightMetricRow,
  InsightPulseGroup,
  InsightTaskRow as WorkedRow,
} from "../lib/insights";
import { taskHue } from "../lib/period";
import { TASK_STATUS_LABEL } from "../lib/tasks";
import { formatCompactDuration } from "../lib/time";
import { NestIcon } from "./PulseIcon";

/** Day: status groups. Week: one row per weekday. */
export function InsightLedger({
  days,
  mode,
}: {
  days: InsightDay[];
  mode: "day" | "week";
}) {
  if (mode === "day") {
    const day = days[0];
    if (!day) return null;
    return (
      <div className="insight-ledger insight-ledger--day">
        <InsightDayTasks day={day} showBars />
      </div>
    );
  }

  return (
    <div className="insight-ledger insight-ledger--week">
      {days.map((day) => (
        <article
          key={day.from}
          className={[
            "insight-week__row",
            day.isToday ? "is-today" : "",
            day.isFuture ? "is-future" : "",
          ]
            .filter(Boolean)
            .join(" ")}
        >
          <h3>{day.label}</h3>
          {day.isFuture ? (
            <p className="insight-quiet insight-quiet--span">Later</p>
          ) : (
            <InsightDayTasks day={day} quietClass="insight-quiet--span" />
          )}
        </article>
      ))}
    </div>
  );
}

function InsightDayTasks({
  day,
  showBars = false,
  quietClass,
}: {
  day: InsightDay;
  showBars?: boolean;
  quietClass?: string;
}) {
  if (day.groups.length === 0) {
    return (
      <p className={["insight-quiet", quietClass].filter(Boolean).join(" ")}>
        Quiet
      </p>
    );
  }
  const busiest = Math.max(
    ...day.groups.flatMap((group) => group.rows.map((row) => row.seconds)),
  );
  return (
    <div className="insight-day-tasks">
      {day.groups.map((group) => (
        <InsightTaskList
          key={group.status}
          label={TASK_STATUS_LABEL[group.status]}
          showBars={showBars}
          busiest={busiest}
          rows={group.rows}
        />
      ))}
    </div>
  );
}

function InsightTaskList({
  label,
  showBars = false,
  busiest,
  rows,
}: {
  label: string;
  showBars?: boolean;
  busiest: number;
  rows: WorkedRow[];
}) {
  return (
    <section className="insight-list">
      <h3>{label}</h3>
      <ul>
        {rows.map((row) => (
          <InsightTaskRow
            key={row.task.id}
            task={row.task}
            seconds={row.seconds}
            barPct={
              showBars && busiest > 0 && row.seconds > 0
                ? Math.max((row.seconds / busiest) * 100, 4)
                : undefined
            }
          />
        ))}
      </ul>
    </section>
  );
}

function InsightTaskRow({
  task,
  seconds,
  barPct,
}: {
  task: Task;
  seconds: number;
  barPct?: number;
}) {
  return (
    <li
      className="insight-task"
      style={{ "--task-hue": taskHue(task.id) } as CSSProperties}
    >
      <span className="insight-task__swatch" aria-hidden="true" />
      <span className="insight-task__title">{task.title}</span>
      <span className="insight-task__meta">
        {seconds > 0 ? formatCompactDuration(seconds) : null}
        {task.value !== null ? (
          <span
            className={`rating-pill rating-pill--v${task.value}`}
            title={`Value ${task.value}`}
          >
            {task.value}
          </span>
        ) : null}
        {task.effort !== null ? (
          <span
            className={`rating-pill rating-pill--v${task.effort}`}
            title={`Effort ${task.effort}`}
          >
            {task.effort}
          </span>
        ) : null}
      </span>
      {barPct != null ? (
        <span
          className="insight-task__bar"
          style={{ width: `${barPct}%` }}
          aria-hidden="true"
        />
      ) : null}
    </li>
  );
}

/** Metric check-ins for the range. The column stays even when the range is quiet. */
export function InsightCheckIns({ groups }: { groups: InsightPulseGroup[] }) {
  return (
    <aside className="insight-pulses" aria-label="Metric check-ins">
      <h3>Metric check-ins</h3>
      {groups.length === 0 ? (
        <p className="insight-quiet">None</p>
      ) : (
        groups.map((group) => (
          <section key={group.pulseId ?? "none"} className="insight-pulse">
            <header>
              <NestIcon name={group.icon} />
              <h4>{group.name}</h4>
              <span>
                {group.checkInCount}{" "}
                {group.checkInCount === 1 ? "check-in" : "check-ins"}
              </span>
            </header>
            <ul>
              {group.metrics.map((metric) => (
                <MetricRibbon key={metric.metricId} metric={metric} />
              ))}
            </ul>
          </section>
        ))
      )}
    </aside>
  );
}

function MetricRibbon({ metric }: { metric: InsightMetricRow }) {
  return (
    <li className="insight-metric">
      <div className="insight-metric__head">
        <span className="insight-metric__name">
          <NestIcon name={metric.icon} color={metric.color} />
          {metric.name}
        </span>
        <span className="insight-metric__avg">{metric.average.toFixed(1)}</span>
      </div>
      <p
        className="insight-metric__ribbon"
        aria-label={`${metric.values.length} ratings`}
      >
        {metric.values.map((value, index) => (
          <span
            key={`${metric.metricId}-${index}`}
            className={`insight-metric__tick insight-metric__tick--v${value}`}
            title={String(value)}
          />
        ))}
      </p>
    </li>
  );
}
