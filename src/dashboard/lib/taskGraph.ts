import type { Task } from "../../lib/types";

/** In-memory indexes for Parent/Child relationships.
 * Used by map, table, and detail — not a visual graph canvas. */
export type TaskGraphProjection = {
  byId: Map<number, Task>;
  childrenByParent: Map<number, Task[]>;
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
): TaskGraphProjection {
  const byId = new Map(tasks.map((task) => [task.id, task]));
  const childrenByParent = new Map<number, Task[]>();

  for (const task of tasks) {
    if (task.parentTaskId !== null) {
      push(childrenByParent, task.parentTaskId, task);
    }
  }

  for (const children of childrenByParent.values()) children.sort(byUpdatedAt);

  return { byId, childrenByParent };
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

export function ancestorIds(
  graph: TaskGraphProjection,
  taskId: number,
): Set<number> {
  const ancestors = new Set<number>();
  let parentId = graph.byId.get(taskId)?.parentTaskId ?? null;
  while (parentId !== null && !ancestors.has(parentId)) {
    ancestors.add(parentId);
    parentId = graph.byId.get(parentId)?.parentTaskId ?? null;
  }
  return ancestors;
}

export function childProgress(graph: TaskGraphProjection, taskId: number) {
  const children = graph.childrenByParent.get(taskId) ?? [];
  return {
    completed: children.filter((child) => child.status === "completed").length,
    total: children.length,
  };
}
