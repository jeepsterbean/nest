import { localDayStartSec } from "../../lib/taskLock";
import type { Task, TaskStatus } from "../../lib/types";
import type { TaskGraphProjection } from "./taskGraph";

export type TaskDayNode = {
  task: Task;
  /** Later Parents of a shared Child get a reference row; the first holds its subtree. */
  reference: boolean;
  /** Closed before today: kept only to show where today's Tasks sit. */
  contextOnly: boolean;
  children: TaskDayNode[];
};

const STATUS_RANK: Record<TaskStatus, number> = {
  active: 0,
  up_next: 1,
  backlog: 2,
  completed: 3,
  cancelled: 4,
};

const isClosed = (task: Task) => task.status === "completed" || task.status === "cancelled";

/** Open Tasks plus Tasks closed on the local day of `nowMs`. */
export const isInTaskDay = (task: Task, nowMs: number) =>
  !isClosed(task) || (task.closedAt !== null && task.closedAt >= localDayStartSec(nowMs));

/**
 * The Day view forest. A Task stays while it belongs to the day or has a
 * descendant that does, so a Parent disappears only once all its Children have.
 */
export function buildTaskDayForest(graph: TaskGraphProjection, nowMs: number): TaskDayNode[] {
  const tasks = [...graph.byId.values()];
  const kept = new Set<number>();
  const keep = (task: Task) => {
    if (kept.has(task.id)) return;
    kept.add(task.id);
    for (const parentId of task.parentTaskIds) {
      const parent = graph.byId.get(parentId);
      if (parent) keep(parent);
    }
  };
  for (const task of tasks) if (isInTaskDay(task, nowMs)) keep(task);

  const keptChildren = (task: Task) =>
    (graph.childrenByParent.get(task.id) ?? []).filter(child => kept.has(child.id));

  // Lowest rank in the full subtree, so a closed Parent holding open work sorts with the open work.
  const rankCache = new Map<number, number>();
  const subtreeRank = (task: Task): number => {
    const cached = rankCache.get(task.id);
    if (cached !== undefined) return cached;
    const rank = Math.min(STATUS_RANK[task.status], ...keptChildren(task).map(subtreeRank));
    rankCache.set(task.id, rank);
    return rank;
  };
  const order = (a: Task, b: Task) =>
    subtreeRank(a) - subtreeRank(b)
    || Number(b.workingNow) - Number(a.workingNow)
    || (a.closedAt ?? 0) - (b.closedAt ?? 0)
    || b.updatedAt - a.updatedAt
    || a.id - b.id;

  const placed = new Set<number>();
  const place = (task: Task): TaskDayNode => {
    const contextOnly = !isInTaskDay(task, nowMs);
    if (placed.has(task.id)) return { task, reference: true, contextOnly, children: [] };
    placed.add(task.id);
    return { task, reference: false, contextOnly, children: keptChildren(task).sort(order).map(place) };
  };

  return tasks
    .filter(task => kept.has(task.id) && !task.parentTaskIds.some(id => kept.has(id)))
    .sort(order)
    .map(place);
}
