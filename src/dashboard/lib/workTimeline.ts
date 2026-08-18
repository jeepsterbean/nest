import type { Task, TaskWorkStretch } from "../../lib/types";

/** A stretch clipped to a column and placed on it as percentages. `col` of
 * `cols` is its side-by-side slot: multiple Tasks may be Working now, so
 * concurrent stretches share the column width instead of hiding each other. */
export type WorkBlock = {
  id: number;
  task: Task;
  from: number;
  to: number;
  startPct: number;
  sizePct: number;
  col: number;
  cols: number;
};

/** Place a span on [from, to). The one geometry every track uses, so a work
 * block and the Phase segment beside it land on the same pixels. Axis-neutral:
 * the grid reads these as top/height. */
export const placeOnWindow = (
  spanFrom: number,
  spanTo: number,
  from: number,
  to: number,
) => {
  const window = to - from;
  if (window <= 0) return { startPct: 0, sizePct: 0 };
  const clippedFrom = Math.max(spanFrom, from);
  const clippedTo = Math.min(spanTo, to);
  return {
    startPct: ((clippedFrom - from) / window) * 100,
    sizePct: (Math.max(clippedTo - clippedFrom, 0) / window) * 100,
  };
};

const stampCols = (blocks: WorkBlock[], start: number, end: number, cols: number) => {
  for (let i = start; i < end; i++) blocks[i].cols = cols;
};

/** Every stretch inside [from, to), in start order, with calendar-style
 * overlap columns. An open stretch runs to now, so a running timer draws up to
 * the present edge. */
export const layoutWorkBlocks = (
  stretches: TaskWorkStretch[],
  tasks: Task[],
  from: number,
  to: number,
  nowMs: number = Date.now(),
): WorkBlock[] => {
  if (to <= from) return [];
  const now = Math.floor(nowMs / 1000);
  const taskById = new Map(tasks.map((task) => [task.id, task]));

  const blocks: WorkBlock[] = [];
  for (const stretch of [...stretches].sort(
    (a, b) => a.startedAt - b.startedAt || a.id - b.id,
  )) {
    const task = taskById.get(stretch.taskId);
    if (!task) continue;
    const spanTo = stretch.endedAt ?? now;
    const blockFrom = Math.max(stretch.startedAt, from);
    const blockTo = Math.min(spanTo, to);
    if (blockTo <= blockFrom) continue;
    blocks.push({
      id: stretch.id,
      task,
      from: blockFrom,
      to: blockTo,
      col: 0,
      cols: 1,
      ...placeOnWindow(stretch.startedAt, spanTo, from, to),
    });
  }

  // Sweep: a run of blocks that transitively overlap is one cluster sharing the
  // width. Inside it each block takes the lowest column already free at its
  // start, so a stretch reuses a slot the moment the one before it ended.
  let clusterStart = 0;
  let clusterEnd = -Infinity;
  const freeAfter: number[] = [];
  blocks.forEach((block, index) => {
    if (block.from >= clusterEnd) {
      stampCols(blocks, clusterStart, index, freeAfter.length);
      clusterStart = index;
      freeAfter.length = 0;
    }
    const free = freeAfter.findIndex((end) => end <= block.from);
    block.col = free === -1 ? freeAfter.length : free;
    freeAfter[block.col] = block.to;
    clusterEnd = Math.max(clusterEnd, block.to);
  });
  stampCols(blocks, clusterStart, blocks.length, freeAfter.length);

  return blocks;
};

/** Worked seconds per Task over the laid-out blocks, busiest first. Replaces
 * the total each per-task lane used to carry. */
export const workTotals = (blocks: WorkBlock[]): { task: Task; seconds: number }[] => {
  const byTask = new Map<number, { task: Task; seconds: number }>();
  for (const block of blocks) {
    const row = byTask.get(block.task.id);
    if (row) row.seconds += block.to - block.from;
    else byTask.set(block.task.id, { task: block.task, seconds: block.to - block.from });
  }
  return [...byTask.values()].sort(
    (a, b) => b.seconds - a.seconds || a.task.id - b.task.id,
  );
};
