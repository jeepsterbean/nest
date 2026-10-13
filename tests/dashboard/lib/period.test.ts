import { describe, expect, it } from "vitest";
import {
  completedInPeriod,
  filledPhaseTotals,
  foldIdleIntoOffline,
  phaseColor,
  phaseIcon,
} from "../../../src/dashboard/lib/period";
import type { Phase, Task, TaskStatusEvent } from "../../../src/lib/types";

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
  closedAt: null,
  followsTaskId: null,
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

describe("completedInPeriod", () => {
  it("yields a task once when it was completed twice in the period", () => {
    expect(
      completedInPeriod(
        [task(1, "completed")],
        [
          event(1, 1, "completed", 60),
          event(2, 1, "active", 65),
          event(3, 1, "completed", 70),
        ],
        { from: 50, to: 80 },
      ).map((item) => item.id),
    ).toEqual([1]);
  });

  it("ignores completions outside the period and non-completion events", () => {
    expect(
      completedInPeriod(
        [task(1, "completed"), task(2, "completed")],
        [event(1, 1, "completed", 40), event(2, 2, "active", 70)],
        { from: 50, to: 80 },
      ),
    ).toEqual([]);
  });

  it("returns tasks in first-completion order", () => {
    expect(
      completedInPeriod(
        [task(1, "completed"), task(2, "completed")],
        [event(1, 2, "completed", 70), event(2, 1, "completed", 60)],
        { from: 50, to: 80 },
      ).map((item) => item.id),
    ).toEqual([1, 2]);
  });

  it("keeps a reopened task on the day it was completed", () => {
    expect(
      completedInPeriod(
        [task(1, "active")],
        [event(1, 1, "completed", 70), event(2, 1, "active", 90)],
        { from: 50, to: 80 },
      ).map((item) => item.id),
    ).toEqual([1]);
  });
});

describe("foldIdleIntoOffline", () => {
  const phases: Phase[] = [
    { id: 1, name: "Doing", icon: "target", color: null, createdAt: 0, inactiveSince: null },
    { id: 4, name: "Offline", icon: "moon", color: null, createdAt: 0, inactiveSince: null },
  ];

  it("adds Idle seconds to Offline", () => {
    expect(
      foldIdleIntoOffline(
        [
          { phaseId: 1, seconds: 10 },
          { phaseId: 4, seconds: 5 },
          { phaseId: null, seconds: 7 },
        ],
        phases,
      ),
    ).toEqual([
      { phaseId: 1, seconds: 10 },
      { phaseId: 4, seconds: 12 },
    ]);
  });
});

describe("filledPhaseTotals", () => {
  const phases: Phase[] = [
    { id: 1, name: "Doing", icon: "target", color: null, createdAt: 0, inactiveSince: null },
    { id: 2, name: "Scoping", icon: "idea", color: null, createdAt: 0, inactiveSince: null },
    { id: 3, name: "Resting", icon: "coffee", color: null, createdAt: 0, inactiveSince: null },
    { id: 4, name: "Offline", icon: "moon", color: null, createdAt: 0, inactiveSince: null },
  ];

  it("keeps missing live Phases as zero", () => {
    expect(filledPhaseTotals([{ phaseId: 1, seconds: 40 }], phases)).toEqual([
      { phaseId: 1, seconds: 40 },
      { phaseId: 2, seconds: 0 },
      { phaseId: 3, seconds: 0 },
      { phaseId: 4, seconds: 0 },
    ]);
  });
});

describe("phase appearance", () => {
  const phases: Phase[] = [
    {
      id: 1,
      name: "Doing",
      icon: "zap",
      color: "#5f8fb8",
      createdAt: 0,
      inactiveSince: null,
    },
    {
      id: 4,
      name: "Offline",
      icon: "moon",
      color: null,
      createdAt: 0,
      inactiveSince: null,
    },
  ];

  it("prefers the stored icon and color", () => {
    expect(phaseIcon(1, phases)).toBe("zap");
    expect(phaseColor(1, phases)).toBe("#5f8fb8");
  });

  it("keeps a stored icon when color is unset", () => {
    expect(phaseIcon(4, phases)).toBe("moon");
    expect(phaseColor(4, phases)).toBeNull();
  });

  it("falls back to name defaults when icon is empty or phase id is null", () => {
    const bare: Phase[] = [
      {
        id: 1,
        name: "Doing",
        icon: "",
        color: null,
        createdAt: 0,
        inactiveSince: null,
      },
    ];
    expect(phaseIcon(1, bare)).toBe("target");
    expect(phaseIcon(null, phases)).toBe("moon");
    expect(phaseColor(null, phases)).toBeNull();
  });
});
