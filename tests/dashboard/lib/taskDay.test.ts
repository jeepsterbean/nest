import { describe, expect, it } from "vitest";
import type {
  TaskStatus,
  TaskStatusEvent,
  TaskWorkStretch,
} from "../../../src/lib/types";
import { buildTaskDay } from "../../../src/dashboard/lib/taskDay";

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
