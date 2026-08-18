import type { Task, TaskWorkStretch } from "../../lib/types";

/** A stretch clipped to a window and placed on it as percentages. */
export type TimelineBlock = {
  id: number;
  from: number;
  to: number;
  leftPct: number;
  widthPct: number;
};

export type WorkLane = {
  task: Task;
  blocks: TimelineBlock[];
  seconds: number;
};

/** Place a span on [from, to). The one geometry both tracks use, so a work
 * block and a Phase segment with the same bounds land on the same pixels. */
export const placeOnWindow = (
  spanFrom: number,
  spanTo: number,
  from: number,
  to: number,
) => {
  const window = to - from;
  if (window <= 0) return { leftPct: 0, widthPct: 0 };
  const clippedFrom = Math.max(spanFrom, from);
  const clippedTo = Math.min(spanTo, to);
  return {
    leftPct: ((clippedFrom - from) / window) * 100,
    widthPct: (Math.max(clippedTo - clippedFrom, 0) / window) * 100,
  };
};

/** One lane per task with work inside the window, busiest first. An open
 * stretch runs to now, so a running timer draws up to the present edge. */
export const buildWorkLanes = (
  stretches: TaskWorkStretch[],
  tasks: Task[],
  from: number,
  to: number,
  nowMs: number = Date.now(),
): WorkLane[] => {
  if (to <= from) return [];
  const now = Math.floor(nowMs / 1000);
  const byTask = new Map<number, TimelineBlock[]>();

  for (const stretch of [...stretches].sort(
    (a, b) => a.startedAt - b.startedAt || a.id - b.id,
  )) {
    const spanTo = stretch.endedAt ?? now;
    const blockFrom = Math.max(stretch.startedAt, from);
    const blockTo = Math.min(spanTo, to);
    if (blockTo <= blockFrom) continue;
    const block: TimelineBlock = {
      id: stretch.id,
      from: blockFrom,
      to: blockTo,
      ...placeOnWindow(stretch.startedAt, spanTo, from, to),
    };
    const existing = byTask.get(stretch.taskId);
    if (existing) existing.push(block);
    else byTask.set(stretch.taskId, [block]);
  }

  const lanes: WorkLane[] = [];
  for (const task of tasks) {
    const blocks = byTask.get(task.id);
    if (!blocks || blocks.length === 0) continue;
    lanes.push({
      task,
      blocks,
      seconds: blocks.reduce((total, block) => total + (block.to - block.from), 0),
    });
  }
  return lanes.sort(
    (a, b) => b.seconds - a.seconds || a.task.id - b.task.id,
  );
};
