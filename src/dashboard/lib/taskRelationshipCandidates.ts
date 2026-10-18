import type { Task } from "../../lib/types";
import { CLOSED_STATUSES } from "./tasks";

const RECENT_CLOSURE_SECONDS = 7 * 24 * 60 * 60;

export function taskRelationshipCandidates(
  tasks: Task[],
  nowMs: number,
): { task: Task; searchOnly: boolean }[] {
  const cutoff = nowMs / 1000 - RECENT_CLOSURE_SECONDS;
  return tasks.map((task) => ({
    task,
    searchOnly: CLOSED_STATUSES.includes(task.status) &&
      (task.closedAt === null || task.closedAt < cutoff),
  })).sort((left, right) =>
    Number(left.searchOnly) - Number(right.searchOnly) ||
    right.task.updatedAt - left.task.updatedAt || right.task.id - left.task.id,
  );
}
