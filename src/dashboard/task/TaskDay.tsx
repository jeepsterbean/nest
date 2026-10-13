import { useId, useState } from "react";
import type { Task, TaskWorkStretch } from "../../lib/types";
import { buildOpenTaskGroups, buildTaskDay } from "../lib/taskDay";
import type { TaskGraphProjection } from "../lib/taskGraph";
import {
  dayLabel,
  formatCompactDuration,
  formatTime,
  startOfDayMs,
} from "../lib/time";
import { TaskDayOpen } from "./TaskDayOpen";

type TaskDayStatKey =
  | "created"
  | "completed"
  | "cancelled"
  | "incomplete"
  | "workedOn";

type TaskDayMeasure = {
  key: TaskDayStatKey;
  label: string;
  value: number;
  /** The stat this one is a part of, shown as "of N" beside its value. */
  outOf?: number;
  rows: { taskId: number; meta: string }[];
};

type TaskDayMeasureGroup = {
  label: string;
  measures: TaskDayMeasure[];
};

export function TaskDay({
  selectedDayMs,
  nowMs,
  tasks,
  taskGraph,
  workStretches,
  onSelectTask,
}: {
  selectedDayMs: number;
  nowMs: number;
  tasks: Task[];
  taskGraph: TaskGraphProjection;
  workStretches: TaskWorkStretch[];
  onSelectTask: (id: number, origin?: HTMLElement) => void;
}) {
  const [selectedStat, setSelectedStat] = useState<TaskDayStatKey | null>(null);
  const detailId = useId();
  const label = dayLabel(selectedDayMs / 1000, nowMs);
  const day = buildTaskDay(
    selectedDayMs,
    nowMs,
    tasks,
    workStretches,
  );
  const taskTitles = new Map(tasks.map((task) => [task.id, task.title]));
  const statusRows = (rows: typeof day.created) =>
    rows.map((row) => ({
      taskId: row.taskId,
      meta: formatTime(row.at),
    }));
  const workedRows = day.worked.map((row) => ({
    taskId: row.taskId,
    meta: formatCompactDuration(row.seconds),
  }));
  // Each group reads from one history, so its stats can be compared: Changes
  // from status events, Work from Work stretches. Incomplete is the part of
  // Worked on still open when the day ended.
  const changes: TaskDayMeasure[] = [
    {
      key: "created",
      label: "Created",
      value: day.summary.created,
      rows: statusRows(day.created),
    },
    {
      key: "completed",
      label: "Completed",
      value: day.summary.completed,
      rows: statusRows(day.completed),
    },
    {
      key: "cancelled",
      label: "Cancelled",
      value: day.summary.cancelled,
      rows: statusRows(day.cancelled),
    },
  ];
  const work: TaskDayMeasure[] = [
    {
      key: "workedOn",
      label: "Worked on",
      value: day.summary.workedOn,
      rows: workedRows,
    },
    {
      key: "incomplete",
      label: "Incomplete",
      value: day.summary.incomplete,
      outOf: day.summary.workedOn,
      rows: day.incomplete.map((row) => ({
        taskId: row.taskId,
        meta: formatCompactDuration(row.seconds),
      })),
    },
  ];
  const groups: TaskDayMeasureGroup[] = [
    { label: "Changes", measures: changes },
    { label: "Work", measures: work },
  ];
  // Open Tasks are a present-tense list; a past day's leftovers already show as Incomplete.
  const isToday = selectedDayMs === startOfDayMs(nowMs / 1000);
  const openMeasure = [...changes, ...work].find(
    (measure) => measure.key === selectedStat && measure.rows.length > 0,
  );

  return (
    <div className="task-day">
      <div
        className="task-day__summary"
        role="group"
        aria-label={`${label} task summary`}
      >
        {groups.map((group) => (
          <section
            key={group.label}
            className="task-day__group"
            aria-label={group.label}
          >
            <h3>{group.label}</h3>
            <ul>
              {group.measures.map((measure) => (
                <li key={measure.key}>
                  <button
                    type="button"
                    className={`task-day__measure${
                      openMeasure?.key === measure.key ? " is-open" : ""
                    }`}
                    aria-expanded={
                      measure.rows.length > 0
                        ? openMeasure?.key === measure.key
                        : undefined
                    }
                    aria-controls={
                      measure.rows.length > 0 ? detailId : undefined
                    }
                    disabled={measure.rows.length === 0}
                    onClick={() =>
                      setSelectedStat((current) =>
                        current === measure.key ? null : measure.key,
                      )
                    }
                  >
                    <span>{measure.label}</span>
                    <strong>
                      {measure.value}
                      {measure.outOf !== undefined && measure.outOf > 0 && (
                        <small> of {measure.outOf}</small>
                      )}
                    </strong>
                  </button>
                </li>
              ))}
            </ul>
          </section>
        ))}
      </div>
      {openMeasure && (
        <section
          id={detailId}
          className="task-day__detail"
          aria-label={`${openMeasure.label} Tasks`}
        >
          <h3>{openMeasure.label}</h3>
          <ul>
            {openMeasure.rows.map((row) => (
              <li key={row.taskId}>
                <button
                  type="button"
                  title="Open task details"
                  onClick={(event) =>
                    onSelectTask(row.taskId, event.currentTarget)
                  }
                >
                  <span>{taskTitles.get(row.taskId) ?? `Task ${row.taskId}`}</span>
                  <span>{row.meta}</span>
                </button>
              </li>
            ))}
          </ul>
        </section>
      )}
      {isToday && (
        <TaskDayOpen
          groups={buildOpenTaskGroups(taskGraph, day.worked)}
          onSelectTask={onSelectTask}
        />
      )}
    </div>
  );
}
