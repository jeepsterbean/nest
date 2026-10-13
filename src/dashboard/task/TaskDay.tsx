import { useId, useState } from "react";
import { createPortal } from "react-dom";
import type { Task, TaskWorkStretch } from "../../lib/types";
import {
  buildOpenTaskGroups,
  buildTaskDay,
  shownTaskDayList,
  type TaskDayListKey,
  type TaskDaySummary,
} from "../lib/taskDay";
import type { TaskGraphProjection } from "../lib/taskGraph";
import {
  dayLabel,
  formatCompactDuration,
  formatTime,
  startOfDayMs,
} from "../lib/time";
import { TaskDayOpen } from "./TaskDayOpen";

type TaskDayMeasure = {
  key: keyof TaskDaySummary;
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
  indexSlot,
  onSelectTask,
}: {
  selectedDayMs: number;
  nowMs: number;
  tasks: Task[];
  taskGraph: TaskGraphProjection;
  workStretches: TaskWorkStretch[];
  /** Where the index of lists renders; it sits above the list without one. */
  indexSlot: HTMLElement | null;
  onSelectTask: (id: number, origin?: HTMLElement) => void;
}) {
  const [chosenList, setChosenList] = useState<TaskDayListKey | null>(null);
  const listId = useId();
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
  // Each group reads from one history, so its stats can be compared: Status changes
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
    { label: "Status changes", measures: changes },
    { label: "Work", measures: work },
  ];
  // Open Tasks are a present-tense list; a past day's leftovers already show as Incomplete.
  const isToday = selectedDayMs === startOfDayMs(nowMs / 1000);
  const openGroups = isToday
    ? buildOpenTaskGroups(taskGraph, day.worked)
    : null;
  const shownList = shownTaskDayList(chosenList, isToday, day.summary);
  const shownMeasure = [...changes, ...work].find(
    (measure) => measure.key === shownList,
  );
  const indexRow = (
    key: TaskDayListKey,
    rowLabel: string,
    count: number,
    outOf?: number,
  ) => (
    <button
      type="button"
      className={`task-day-index__row${outOf === undefined ? "" : " task-day-index__row--part"}`}
      title={outOf === undefined ? undefined : `${count} of ${outOf} Worked on`}
      aria-pressed={shownList === key}
      aria-controls={listId}
      // Open stays selectable at zero so today always has a place to land.
      disabled={count === 0 && key !== "open"}
      onClick={() => setChosenList(key)}
    >
      <span className="task-day-index__name">{rowLabel}</span>
      <span className="task-day-index__count">{count}</span>
    </button>
  );
  const index = (
    <nav className="task-day-index" aria-label={`${label} Task lists`}>
      {openGroups && (
        <ul>
          <li>
            {indexRow(
              "open",
              "Open",
              openGroups.reduce((total, group) => total + group.rows.length, 0),
            )}
          </li>
        </ul>
      )}
      {groups.map((group) => (
        <section key={group.label} aria-label={group.label}>
          <h3>{group.label}</h3>
          <ul>
            {group.measures.map((measure) => (
              <li key={measure.key}>
                {indexRow(
                  measure.key,
                  measure.label,
                  measure.value,
                  measure.outOf,
                )}
              </li>
            ))}
          </ul>
        </section>
      ))}
    </nav>
  );

  return (
    <div className="task-day">
      {indexSlot ? createPortal(index, indexSlot) : index}
      <div id={listId} className="task-day__list">
        {shownList === "open" && openGroups ? (
          <TaskDayOpen groups={openGroups} onSelectTask={onSelectTask} />
        ) : (
          shownMeasure && (
            <section
              className="task-day__detail"
              aria-label={`${shownMeasure.label} Tasks`}
            >
              <h3>{shownMeasure.label}</h3>
              {shownMeasure.rows.length === 0 ? (
                <p className="task-day__empty">Nothing recorded this day.</p>
              ) : (
                <ul>
                  {shownMeasure.rows.map((row) => (
                    <li key={row.taskId}>
                      <button
                        type="button"
                        title="Open task details"
                        onClick={(event) =>
                          onSelectTask(row.taskId, event.currentTarget)
                        }
                      >
                        <span>
                          {taskTitles.get(row.taskId) ?? `Task ${row.taskId}`}
                        </span>
                        <span>{row.meta}</span>
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          )
        )}
      </div>
    </div>
  );
}
