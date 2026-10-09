import { useId, useState } from "react";
import type { Task, TaskStatusEvent, TaskWorkStretch } from "../../lib/types";
import { DateNavigation } from "../components/DateNavigation";
import { buildTaskDay } from "../lib/taskDay";
import { dayLabel, formatCompactDuration, formatTime } from "../lib/time";

type TaskDayStatKey =
  | "created"
  | "completed"
  | "cancelled"
  | "incomplete"
  | "workedOn"
  | "workedTime";

type TaskDayMeasure = {
  key: TaskDayStatKey;
  label: string;
  value: number | string;
  rows: { taskId: number; meta: string }[];
};

export function TaskDay({
  selectedDayMs,
  nowMs,
  canGoPrevious,
  canGoNext,
  tasks,
  statusEvents,
  workStretches,
  onPreviousDay,
  onNextDay,
  onToday,
  onSelectTask,
}: {
  selectedDayMs: number;
  nowMs: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  tasks: Task[];
  statusEvents: TaskStatusEvent[];
  workStretches: TaskWorkStretch[];
  onPreviousDay: () => void;
  onNextDay: () => void;
  onToday: () => void;
  onSelectTask: (id: number, origin?: HTMLElement) => void;
}) {
  const [selectedStat, setSelectedStat] = useState<TaskDayStatKey | null>(null);
  const detailId = useId();
  const label = dayLabel(selectedDayMs / 1000, nowMs);
  const day = buildTaskDay(
    selectedDayMs,
    nowMs,
    tasks,
    statusEvents,
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
  const measures: TaskDayMeasure[] = [
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
    {
      key: "incomplete",
      label: "Incomplete",
      value: day.summary.incomplete,
      rows: day.incomplete.map((row) => ({
        taskId: row.taskId,
        meta: formatCompactDuration(row.seconds),
      })),
    },
    {
      key: "workedOn",
      label: "Worked on",
      value: day.summary.workedOn,
      rows: workedRows,
    },
    {
      key: "workedTime",
      label: "Worked time",
      value: formatCompactDuration(day.summary.workedSeconds),
      rows: workedRows,
    },
  ];
  const openMeasure = measures.find(
    (measure) => measure.key === selectedStat && measure.rows.length > 0,
  );

  return (
    <div className="task-day">
      <DateNavigation
        label={label}
        unit="day"
        canGoPrevious={canGoPrevious}
        canGoNext={canGoNext}
        onPrevious={onPreviousDay}
        onNext={onNextDay}
        onToday={onToday}
      />
      <ul className="task-day__summary" aria-label={`${label} task summary`}>
        {measures.map((measure) => (
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
                  current === measure.key
                    ? null
                    : measure.key,
                )
              }
            >
              <span>{measure.label}</span>
              <strong>{measure.value}</strong>
            </button>
          </li>
        ))}
      </ul>
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
    </div>
  );
}
