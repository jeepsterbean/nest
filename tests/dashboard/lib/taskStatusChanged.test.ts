import { describe, expect, it } from "vitest";
import { statusChangedTaskIds } from "../../../src/dashboard/lib/taskStatusChanged";
import type { TaskStatusEvent } from "../../../src/lib/types";

const event = (taskId: number, createdAt: number, fromStatus: TaskStatusEvent["fromStatus"] = "active", toStatus: TaskStatusEvent["toStatus"] = "completed"): TaskStatusEvent =>
  ({ id: taskId, taskId, createdAt, fromStatus, toStatus });

describe("Status changed membership", () => {
  it("includes any transition, deduplicates Tasks, and respects half-open range boundaries", () => {
    expect([...statusChangedTaskIds([
      event(1, 100), event(1, 150, "completed", "active"), event(2, 199, "backlog", "up_next"),
      event(3, 99), event(4, 200), event(5, 120, null), event(6, 120, "active", "active"),
    ], 100, 200)]).toEqual([1, 2]);
  });
});
