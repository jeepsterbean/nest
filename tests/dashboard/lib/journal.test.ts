import { describe, expect, it } from "vitest";
import { completionTotals } from "../../../src/dashboard/lib/journal";
import type { Task, TaskStatusEvent } from "../../../src/lib/types";

const task = (id: number, status: Task["status"]): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status,
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope: null,
  value: 2,
  effort: 1,
  parentTaskId: null,
  createdAt: 10,
  updatedAt: 100,
});

const event = (
  id: number,
  taskId: number,
  toStatus: TaskStatusEvent["toStatus"],
  createdAt: number,
): TaskStatusEvent => ({
  id,
  taskId,
  fromStatus: null,
  toStatus,
  createdAt,
});

describe("completionTotals", () => {
  it("counts a task on the day it was completed even if it was reopened", () => {
    expect(
      completionTotals(
        [task(1, "active")],
        [event(1, 1, "completed", 70), event(2, 1, "active", 90)],
        { from: 50, to: 80 },
      ),
    ).toMatchObject({ completed: 1, value: 2, effort: 1 });
  });

  it("counts a task once when it was completed twice in the period", () => {
    expect(
      completionTotals(
        [task(1, "completed")],
        [
          event(1, 1, "completed", 60),
          event(2, 1, "active", 65),
          event(3, 1, "completed", 70),
        ],
        { from: 50, to: 80 },
      ),
    ).toMatchObject({ completed: 1, value: 2 });
  });

  it("ignores completions outside the period and non-completion events", () => {
    expect(
      completionTotals(
        [task(1, "completed"), task(2, "completed")],
        [event(1, 1, "completed", 40), event(2, 2, "active", 70)],
        { from: 50, to: 80 },
      ),
    ).toMatchObject({ completed: 0, value: 0, valueScored: 0 });
  });

  it("totals current task scores without inventing missing values", () => {
    const unscored = { ...task(2, "completed"), value: null, effort: null };
    expect(
      completionTotals(
        [task(1, "completed"), unscored],
        [event(1, 1, "completed", 60), event(2, 2, "completed", 70)],
        { from: 50, to: 80 },
      ),
    ).toEqual({
      completed: 2,
      value: 2,
      effort: 1,
      valueScored: 1,
      effortScored: 1,
    });
  });
});
