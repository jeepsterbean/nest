import { describe, expect, it } from "vitest";
import type {
  Task,
  TaskStatus,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../../src/lib/types";
import {
  buildOpenTaskGroups,
  buildTaskDay,
} from "../../../src/dashboard/lib/taskDay";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";

const at = (day: number, hour: number, minute = 0) =>
  Math.floor(new Date(2026, 0, day, hour, minute).getTime() / 1000);

const statusEvent = (
  id: number,
  taskId: number,
  fromStatus: TaskStatusEvent["fromStatus"],
  toStatus: TaskStatusEvent["toStatus"],
  createdAt: number,
): TaskStatusEvent => ({ id, taskId, fromStatus, toStatus, createdAt });

const task = (id: number, status: TaskStatus) => ({ id, status });

describe("task day", () => {
  it("groups the Tasks behind each lifecycle stat", () => {
    const dayMs = at(8, 0) * 1000;
    const events = [
      statusEvent(1, 1, null, "backlog", at(8, 9)),
      statusEvent(2, 1, "backlog", "completed", at(8, 11)),
      statusEvent(3, 3, "active", "cancelled", at(7, 16)),
    ];
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(8, 9, 30), endedAt: at(8, 10) },
      { id: 2, taskId: 2, startedAt: at(8, 12), endedAt: at(8, 12, 15) },
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 18) * 1000,
      [task(1, "completed"), task(2, "active"), task(3, "cancelled")],
      events,
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
      [],
      stretches,
    );

    expect(result.summary.workedOn).toBe(1);
    expect(result.summary.workedSeconds).toBe(3 * 60 * 60);
    expect(result.worked).toEqual([
      { taskId: 1, seconds: 3 * 60 * 60 },
    ]);
    expect(result.incomplete).toEqual(result.worked);
  });

  it("counts a Task once when it reaches the same outcome more than once", () => {
    const dayMs = at(8, 0) * 1000;
    const events = [
      statusEvent(1, 1, "active", "completed", at(8, 9)),
      statusEvent(2, 1, "completed", "active", at(8, 10)),
      statusEvent(3, 1, "active", "completed", at(8, 11)),
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 18) * 1000,
      [task(1, "completed")],
      events,
      [],
    );

    expect(result.summary.completed).toBe(1);
    expect(result.completed).toEqual([{ taskId: 1, at: at(8, 11) }]);
  });

  it("treats worked Tasks reopened before day end as incomplete", () => {
    const dayMs = at(8, 0) * 1000;
    const events = [
      statusEvent(1, 1, "active", "completed", at(8, 9)),
      statusEvent(2, 1, "completed", "active", at(8, 10)),
    ];
    const stretches: TaskWorkStretch[] = [
      { id: 1, taskId: 1, startedAt: at(8, 8), endedAt: at(8, 9) },
    ];

    const result = buildTaskDay(
      dayMs,
      at(8, 18) * 1000,
      [task(1, "active")],
      events,
      stretches,
    );

    expect(result.completed).toEqual([]);
    expect(result.incomplete).toEqual([
      { taskId: 1, seconds: 60 * 60 },
    ]);
  });
});

describe("open task groups", () => {
  const openTask = (
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
    createdAt: 0,
    updatedAt: id,
    ...overrides,
  });

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
