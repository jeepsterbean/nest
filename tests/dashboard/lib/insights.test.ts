import { describe, expect, it } from "vitest";
import {
  latestCompletions,
  phaseDurations,
  summarizePeriod,
} from "../../../src/dashboard/lib/insights";
import type {
  PhaseCheckIn,
  Task,
  TaskStatusEvent,
} from "../../../src/lib/types";

const task = (id: number, status: Task["status"], scope: string | null = null): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status,
  scope,
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

const phase = (id: number, phaseId: number, createdAt: number): PhaseCheckIn => ({
  id,
  phaseId,
  phaseLabel: null,
  createdAt,
});

describe("latestCompletions", () => {
  it("counts a currently completed task once at its latest completion", () => {
    const result = latestCompletions(
      [task(1, "completed")],
      [
        event(1, 1, "completed", 30),
        event(2, 1, "active", 40),
        event(3, 1, "completed", 70),
      ],
      { from: 50, to: 100 },
      null,
      [phase(1, 2, 60)],
    );
    expect(result).toHaveLength(1);
    expect(result[0]).toMatchObject({ at: 70, phaseId: 2 });
  });

  it("excludes reopened and out-of-scope tasks", () => {
    const result = latestCompletions(
      [task(1, "active"), task(2, "completed", "Work / Nest")],
      [event(1, 1, "completed", 70), event(2, 2, "completed", 80)],
      { from: 50, to: 100 },
      "Home",
      [],
    );
    expect(result).toEqual([]);
  });
});

describe("summarizePeriod", () => {
  it("totals current task scores without inventing missing values", () => {
    const scored = task(2, "completed");
    const unscored = { ...task(3, "completed"), value: null, effort: null };
    const summary = summarizePeriod([
      { task: scored, at: 80, phaseId: null },
      { task: unscored, at: 70, phaseId: null },
    ]);
    expect(summary).toMatchObject({
      value: 2,
      effort: 1,
      valueScoredTasks: 1,
      effortScoredTasks: 1,
    });
  });
});

describe("phaseDurations", () => {
  it("carries the phase active before the range into the range", () => {
    expect(
      phaseDurations(
        [phase(1, 1, 10), phase(2, 2, 60), phase(3, 3, 120)],
        { from: 40, to: 100 },
      ),
    ).toEqual([
      { phaseId: 2, seconds: 40 },
      { phaseId: 1, seconds: 20 },
    ]);
  });
});
