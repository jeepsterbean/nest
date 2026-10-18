import { describe, expect, it } from "vitest";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import { buildTaskDayForest, type TaskDayNode } from "../../../src/dashboard/lib/taskDayTree";
import { localDayStartSec } from "../../../src/lib/taskLock";
import type { Task } from "../../../src/lib/types";

const NOW_MS = new Date(2026, 9, 18, 15, 0).getTime();
const TODAY = localDayStartSec(NOW_MS);
const YESTERDAY = TODAY - 3600;

const task = (id: number, patch: Partial<Task> = {}): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status: "backlog",
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  value: null,
  effort: null,
  parentTaskIds: [],
  createdAt: 0,
  updatedAt: id,
  closedAt: null,
  followsTaskId: null,
  historyRevision: 0,
  ...patch,
});

const forestOf = (tasks: Task[]) => buildTaskDayForest(buildTaskGraph(tasks), NOW_MS);
const shape = (nodes: TaskDayNode[]): unknown[] =>
  nodes.map(node => [node.task.id, node.reference ? "ref" : "full", shape(node.children)]);

describe("buildTaskDayForest", () => {
  it("keeps open Tasks and Tasks closed today, and drops older closures", () => {
    const forest = forestOf([
      task(1),
      task(2, { status: "completed", closedAt: TODAY + 60 }),
      task(3, { status: "completed", closedAt: YESTERDAY }),
    ]);
    expect(forest.map(node => node.task.id)).toEqual([1, 2]);
  });

  it("nests a Task closed today under a Parent closed earlier, marking the Parent as context", () => {
    const forest = forestOf([
      task(1, { status: "completed", closedAt: YESTERDAY }),
      task(2, { status: "completed", closedAt: TODAY + 60, parentTaskIds: [1] }),
    ]);
    expect(shape(forest)).toEqual([[1, "full", [[2, "full", []]]]]);
    expect(forest[0]!.contextOnly).toBe(true);
    expect(forest[0]!.children[0]!.contextOnly).toBe(false);
  });

  it("drops a Parent closed earlier once none of its Children remain", () => {
    const forest = forestOf([
      task(1, { status: "completed", closedAt: YESTERDAY }),
      task(2, { status: "completed", closedAt: YESTERDAY, parentTaskIds: [1] }),
    ]);
    expect(forest).toEqual([]);
  });

  it("keeps a context chain from a grandparent to today's Task", () => {
    const forest = forestOf([
      task(1, { status: "cancelled", closedAt: YESTERDAY }),
      task(2, { status: "cancelled", closedAt: YESTERDAY, parentTaskIds: [1] }),
      task(3, { parentTaskIds: [2] }),
    ]);
    expect(shape(forest)).toEqual([[1, "full", [[2, "full", [[3, "full", []]]]]]]);
  });

  it("places a shared Child in full once and as a reference under its other Parent", () => {
    const forest = forestOf([
      task(1, { status: "active" }),
      task(2),
      task(3, { parentTaskIds: [1, 2] }),
    ]);
    expect(shape(forest)).toEqual([
      [1, "full", [[3, "full", []]]],
      [2, "full", [[3, "ref", []]]],
    ]);
  });

  it("orders open work before closed work and sorts a closed Parent by its open Children", () => {
    const forest = forestOf([
      task(1, { status: "completed", closedAt: TODAY + 60 }),
      task(2, { status: "completed", closedAt: YESTERDAY }),
      task(3, { status: "active", parentTaskIds: [2] }),
      task(4, { status: "backlog" }),
    ]);
    expect(forest.map(node => node.task.id)).toEqual([2, 4, 1]);
  });
});
