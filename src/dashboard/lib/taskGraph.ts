import type { Task, TaskDependency } from "../../lib/types";

/** In-memory indexes for Parent/Child and Blocker/Dependent edges.
 * Used by map, table, and detail — not a visual graph canvas. */
export type TaskGraphProjection = {
  byId: Map<number, Task>;
  childrenByParent: Map<number, Task[]>;
  blockersByTask: Map<number, Task[]>;
  dependentsByTask: Map<number, Task[]>;
};

const push = (map: Map<number, Task[]>, id: number, task: Task) => {
  const values = map.get(id);
  if (values) values.push(task);
  else map.set(id, [task]);
};

const byUpdatedAt = (a: Task, b: Task) =>
  b.updatedAt - a.updatedAt || b.id - a.id;

export function buildTaskGraph(
  tasks: Task[],
  dependencies: TaskDependency[],
): TaskGraphProjection {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<number, Task[]>();
  const blockersByTask = new Map<number, Task[]>();
  const dependentsByTask = new Map<number, Task[]>();

  for (const task of tasks) {
    if (task.parentTaskId !== null) {
      push(childrenByParent, task.parentTaskId, task);
    }
  }
  for (const dependency of dependencies) {
    const blocker = byId.get(dependency.blockerTaskId);
    const blocked = byId.get(dependency.blockedTaskId);
    if (!blocker || !blocked) continue;
    push(blockersByTask, blocked.id, blocker);
    push(dependentsByTask, blocker.id, blocked);
  }

  for (const collection of [
    childrenByParent,
    blockersByTask,
    dependentsByTask,
  ]) {
    for (const values of collection.values()) values.sort(byUpdatedAt);
  }

  return { byId, childrenByParent, blockersByTask, dependentsByTask };
}

export function unresolvedBlockers(
  graph: TaskGraphProjection,
  taskId: number,
): Task[] {
  return (graph.blockersByTask.get(taskId) ?? []).filter(
    (task) => task.status !== "completed",
  );
}

export function isTaskBlocked(graph: TaskGraphProjection, taskId: number) {
  const task = graph.byId.get(taskId);
  if (!task || task.status === "completed" || task.status === "cancelled") {
    return false;
  }
  return unresolvedBlockers(graph, taskId).length > 0;
}

export function descendantIds(
  graph: TaskGraphProjection,
  taskId: number,
): Set<number> {
  const descendants = new Set<number>();
  const pending = [...(graph.childrenByParent.get(taskId) ?? [])];
  while (pending.length > 0) {
    const child = pending.pop();
    if (!child || descendants.has(child.id)) continue;
    descendants.add(child.id);
    pending.push(...(graph.childrenByParent.get(child.id) ?? []));
  }
  return descendants;
}

export function childProgress(graph: TaskGraphProjection, taskId: number) {
  const children = graph.childrenByParent.get(taskId) ?? [];
  return {
    completed: children.filter((child) => child.status === "completed").length,
    total: children.length,
  };
}
