import { describe, expect, it } from "vitest";
import type {
  Task,
  TaskStatus,
  TaskWorkStretch,
} from "../../../src/lib/types";
import {
  buildOpenTaskGroups,
  buildTaskDay,
  taskDayTableFilters,
} from "../../../src/dashboard/lib/taskDay";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import { taskMatchesTableRowFilters } from "../../../src/dashboard/lib/taskTableFilter";
import { taskWorkedSecondsInRange } from "../../../src/dashboard/lib/taskWorkedOn";

const at = (day: number, hour: number, minute = 0) =>
  Math.floor(new Date(2026, 0, day, hour, minute).getTime() / 1000);

const task = (
  id: number,
  status: TaskStatus,
  overrides: Partial<Task> = {},
): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status,
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope: null,
  value: null,
  effort: null,
  parentTaskId: null,
  closedAt: null,
  followsTaskId: null,
  createdAt: at(1, 9),
  updatedAt: at(1, 9),
  ...overrides,
});

describe("task day", () => {
  it("groups the Tasks behind each lifecycle stat", () => {
    const dayMs = at(8, 0) * 1000;
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(8, 9, 30), endedAt: at(8, 10) },
      { id: 2, taskId: 2, startedAt: at(8, 12), endedAt: at(8, 12, 15) },
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 18) * 1000,
      [
        task(1, "completed", { createdAt: at(8, 9), closedAt: at(8, 11) }),
        task(2, "active"),
        task(3, "cancelled", { closedAt: at(7, 16) }),
      ],
      stretches,
    );

    expect(result.summary).toEqual({
      created: 1,
      completed: 1,
      cancelled: 0,
      incomplete: 1,
      workedOn: 2,
      workedSeconds: 45 * 60,
    });
    expect(result.created).toEqual([{ taskId: 1, at: at(8, 9) }]);
    expect(result.completed).toEqual([{ taskId: 1, at: at(8, 11) }]);
    expect(result.cancelled).toEqual([]);
    expect(result.incomplete).toEqual([
      { taskId: 2, seconds: 15 * 60 },
    ]);
    expect(result.worked).toEqual([
      { taskId: 1, seconds: 30 * 60 },
      { taskId: 2, seconds: 15 * 60 },
    ]);
  });

  it("clips spanning and open Work stretches to the selected day and now", () => {
    const dayMs = at(8, 0) * 1000;
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(7, 23), endedAt: at(8, 1) },
      { id: 2, taskId: 1, startedAt: at(8, 10), endedAt: null },
      { id: 3, taskId: 2, startedAt: at(7, 8), endedAt: at(7, 9) },
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 12) * 1000,
      [task(1, "active"), task(2, "active")],
      stretches,
    );

    expect(result.summary.workedOn).toBe(1);
    expect(result.summary.workedSeconds).toBe(3 * 60 * 60);
    expect(result.worked).toEqual([
      { taskId: 1, seconds: 3 * 60 * 60 },
    ]);
    expect(result.incomplete).toEqual(result.worked);
  });

  it("gives a worked Task one outcome per day: Incomplete until its closing day", () => {
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(7, 8), endedAt: at(7, 9) },
      { id: 2, taskId: 1, startedAt: at(8, 8), endedAt: at(8, 9) },
      { id: 3, taskId: 1, startedAt: at(9, 8), endedAt: at(9, 9) },
    ];
    const tasks = [task(1, "completed", { closedAt: at(8, 11) })];
    const dayAt = (day: number) =>
      buildTaskDay(at(day, 0) * 1000, at(10, 12) * 1000, tasks, stretches).summary;

    expect(dayAt(7)).toMatchObject({ completed: 0, incomplete: 1 });
    expect(dayAt(8)).toMatchObject({ completed: 1, incomplete: 0 });
    // Work corrected onto a later day is still Worked on, with no new outcome.
    expect(dayAt(9)).toMatchObject({ completed: 0, incomplete: 0, workedOn: 1 });
  });

  it("treats worked Tasks reopened before day end as incomplete", () => {
    const dayMs = at(8, 0) * 1000;
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(8, 8), endedAt: at(8, 9) },
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 18) * 1000,
      [task(1, "active")],
      stretches,
    );

    expect(result.completed).toEqual([]);
    expect(result.incomplete).toEqual([
      { taskId: 1, seconds: 60 * 60 },
    ]);
  });

  it("lists for each stat the rows its table filters select", () => {
    const dayMs = at(8, 0) * 1000;
    const nowMs = at(9, 12) * 1000;
    const tasks = [
      task(1, "completed", { createdAt: at(8, 9), closedAt: at(8, 11) }),
      task(2, "cancelled", { closedAt: at(8, 15) }),
      task(3, "active", { createdAt: at(8, 10) }),
      task(4, "completed", { closedAt: at(9, 10) }),
    ];
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 3, startedAt: at(8, 13), endedAt: at(8, 14) },
      { id: 2, taskId: 4, startedAt: at(8, 14), endedAt: at(8, 15) },
    ];
    const filters = taskDayTableFilters(dayMs);
    const workedTaskIds = new Set(
      taskWorkedSecondsInRange(
        stretches,
        { fromSec: at(8, 0), toSec: at(9, 0) },
        nowMs,
      ).keys(),
    );
    const tableRowIds = (stat: "created" | "completed" | "cancelled" | "workedOn") =>
      tasks
        .filter((row) =>
          taskMatchesTableRowFilters(
            row,
            filters[stat],
            stat === "workedOn" ? workedTaskIds : null,
            nowMs,
          ),
        )
        .map((row) => row.id)
        .sort();

    const day = buildTaskDay(dayMs, nowMs, tasks, stretches);
    const ids = (rows: { taskId: number }[]) => rows.map((row) => row.taskId).sort();

    expect(ids(day.created)).toEqual(tableRowIds("created"));
    expect(ids(day.completed)).toEqual(tableRowIds("completed"));
    expect(ids(day.cancelled)).toEqual(tableRowIds("cancelled"));
    expect(ids(day.worked)).toEqual(tableRowIds("workedOn"));
    expect(ids(day.created)).toEqual([1, 3]);
    expect(ids(day.completed)).toEqual([1]);
    expect(ids(day.cancelled)).toEqual([2]);
    expect(ids(day.incomplete)).toEqual([3, 4]);
  });
});

describe("open task groups", () => {
  const openTask = (
    id: number,
    status: TaskStatus,
    overrides: Partial<Task> = {},
  ): Task => task(id, status, { createdAt: 0, updatedAt: id, ...overrides });

  it("groups open Tasks by status with Working now first and Blocked last", () => {
    const tasks = [
      openTask(1, "active"),
      openTask(2, "active", { workingNow: true, updatedAt: 0 }),
      openTask(3, "active", { updatedAt: 99 }),
      openTask(4, "up_next"),
      openTask(5, "completed"),
      openTask(6, "backlog"),
    ];
    const graph = buildTaskGraph(tasks, [
      { blockerTaskId: 6, blockedTaskId: 3, createdAt: 0 },
      { blockerTaskId: 5, blockedTaskId: 4, createdAt: 0 },
    ]);

    const groups = buildOpenTaskGroups(graph, [{ taskId: 1, seconds: 600 }]);

    expect(groups.map((group) => group.status)).toEqual([
      "active",
      "up_next",
      "backlog",
    ]);
    expect(
      groups[0].rows.map((row) => [
        row.task.id,
        row.unresolvedBlockerCount,
        row.workedTodaySeconds,
      ]),
    ).toEqual([
      [2, 0, 0],
      [1, 0, 600],
      [3, 1, 0],
    ]);
    expect(groups[1].rows[0].unresolvedBlockerCount).toBe(0);
    expect(groups.flatMap((group) => group.rows).map((row) => row.task.id))
      .not.toContain(5);
  });
});
