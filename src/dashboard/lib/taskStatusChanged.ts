import type { TaskStatusEvent } from "../../lib/types";

export const statusChangedTaskIds = (events: readonly TaskStatusEvent[], from: number, to: number): ReadonlySet<number> =>
  new Set(events.filter(event => event.fromStatus !== null && event.fromStatus !== event.toStatus && event.createdAt >= from && event.createdAt < to).map(event => event.taskId));
