import { describe, expect, it } from "vitest";
import type { Task } from "../../../src/lib/types";
import { nestTaskRows } from "../../../src/dashboard/lib/taskNesting";

const task = (id: number, parentTaskId: number | null = null) => ({ id, parentTaskId }) as Task;
const ids = (tasks: Task[]) => tasks.map((t) => t.id);

describe("nestTaskRows", () => {
  it("places Children under their Parent in input order", () => {
    const result = nestTaskRows([task(1), task(3, 1), task(2), task(4, 1), task(5, 3)], new Set());
    expect(ids(result.tasks)).toEqual([1, 3, 5, 4, 2]);
    expect(result.depthById.get(5)).toBe(2);
    expect(result.childCountById.get(1)).toBe(2);
  });

  it("shows a Task at top level when its Parent is not in the rows", () => {
    const result = nestTaskRows([task(2, 99), task(3, 2)], new Set());
    expect(ids(result.tasks)).toEqual([2, 3]);
    expect(result.depthById.get(2)).toBe(0);
  });

  it("hides descendants of a collapsed Task but keeps its child count", () => {
    const result = nestTaskRows([task(1), task(2, 1), task(3, 2)], new Set([1]));
    expect(ids(result.tasks)).toEqual([1]);
    expect(result.childCountById.get(1)).toBe(1);
  });
});
