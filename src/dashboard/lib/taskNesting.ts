import type { Task } from "../../lib/types";

export type NestedTaskRows = {
  /** Visible rows in display order: each Parent directly above its Children. */
  tasks: Task[];
  depthById: ReadonlyMap<number, number>;
  /** Direct Children present in the given rows, whether collapsed or not. */
  childCountById: ReadonlyMap<number, number>;
};

/**
 * Regroups already filtered and sorted rows under their Parents.
 * A Task whose Parent is not among the rows becomes a top-level row, so any
 * filter still produces a complete list. Sibling order follows the input order.
 */
export function nestTaskRows(
  tasks: readonly Task[],
  collapsedIds: ReadonlySet<number>,
): NestedTaskRows {
  const present = new Set(tasks.map((task) => task.id));
  const childrenByParent = new Map<number, Task[]>();
  const roots: Task[] = [];

  for (const task of tasks) {
    const parentId = task.parentTaskId;
    if (parentId === null || !present.has(parentId)) {
      roots.push(task);
      continue;
    }
    const siblings = childrenByParent.get(parentId);
    if (siblings) siblings.push(task);
    else childrenByParent.set(parentId, [task]);
  }

  const ordered: Task[] = [];
  const depthById = new Map<number, number>();
  const childCountById = new Map<number, number>();
  const visit = (task: Task, depth: number) => {
    const children = childrenByParent.get(task.id) ?? [];
    ordered.push(task);
    depthById.set(task.id, depth);
    childCountById.set(task.id, children.length);
    if (collapsedIds.has(task.id)) return;
    for (const child of children) visit(child, depth + 1);
  };
  for (const root of roots) visit(root, 0);

  return { tasks: ordered, depthById, childCountById };
}
