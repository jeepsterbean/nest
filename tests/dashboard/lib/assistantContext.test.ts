import { describe, expect, it } from "vitest";
import {
  assembleContext,
  DEFAULT_TASK_DETAIL,
  formatDumps,
  formatMetrics,
  formatTasks,
} from "../../../src/dashboard/lib/assistantContext";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import type { BrainDump, Metric, MetricCheckInWithRatings, Task } from "../../../src/lib/types";

const task = (id: number, status: Task["status"] = "active"): Task => ({
  id, title: id === 1 ? "Plan the day" : "Unblock the task", description: "A useful detail",
  status, workingNow: id === 1, workedSeconds: 90, workStartedAt: null, scope: "Nest",
  value: null, effort: null, parentTaskId: null, createdAt: 0, updatedAt: 0,
});

describe("assistant context", () => {
  it("formats selected Tasks with derived readiness", () => {
    const tasks = [task(1), task(2, "up_next")];
    const graph = buildTaskGraph(tasks, [{ blockerTaskId: 2, blockedTaskId: 1, createdAt: 0 }]);
    const output = formatTasks(tasks, graph, "active", { ...DEFAULT_TASK_DETAIL, description: true });
    expect(output).toContain("Tasks · active");
    expect(output).toContain("blocked by: Unblock the task");
    expect(output).toContain("A useful detail");
  });

  it("formats newest dump and metric rows", () => {
    const dumps: BrainDump[] = [{ id: 1, createdAt: 100, text: "plain thought", tags: [] }];
    const metrics: Metric[] = [{ id: 1, name: "focus", icon: "", color: null, createdAt: 0 }];
    const checkIns: MetricCheckInWithRatings[] = [{ id: 1, createdAt: 100, pulseId: null, pulseName: null, ratings: [{ checkInId: 1, metricId: 1, value: 4 }] }];
    expect(formatDumps(dumps, "last1")).toContain("plain thought");
    expect(formatMetrics(metrics, checkIns, "last1")).toContain("focus 4");
  });

  it("drops empty blocks and keeps literal text", () => {
    expect(assembleContext([
      { id: 1, kind: "block", block: "task" },
      { id: 2, kind: "text", text: "Answer briefly." },
      { id: 3, kind: "block", block: "message" },
    ], { task: "", phase: "", dump: "", metric: "", message: "Help." })).toBe("Answer briefly.\n\nHelp.");
  });
});
