import type { Task, TaskWorkStretch } from "../../lib/types";
import { QUARTER_HOUR_SECONDS, snapToQuarterHour } from "./time";

/** A stretch clipped to a column and placed on it as percentages. `col` of
 * `cols` is its side-by-side slot: multiple Tasks may be Working now, so
 * concurrent stretches share the column width instead of hiding each other. */
export type WorkBlock = {
  id: number;
  task: Task;
  /** Unclipped stretch bounds. `endedAt` is null while still Working now. */
  startedAt: number;
  endedAt: number | null;
  /** Visible slice of this column (clipped). */
  from: number;
  to: number;
  startPct: number;
  sizePct: number;
  col: number;
  cols: number;
};

export type StretchTimes = { startedAt: number; endedAt: number | null };
export type StretchDragKind = "move" | "start" | "end";

/** Place a span on [from, to). The one geometry every track uses, so a work
 * block and the Phase wash behind it land on the same pixels. Axis-neutral:
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
      startedAt: stretch.startedAt,
      endedAt: stretch.endedAt,
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

/** Map a pointer onto a column's clock. `yPct` is 0 at the top (midnight)
 * and 1 at the bottom (next midnight). */
export const timeOnColumn = (from: number, to: number, yPct: number) =>
  from + Math.min(1, Math.max(0, yPct)) * (to - from);

/** Move or resize a stretch so the grabbed edge (or the whole span) follows
 * `pointerAt`, snapping to quarter hours. An open stretch keeps a null end;
 * nothing may start or end after `nowSec`. The 15-minute floor is only for
 * calendar drag-resize — a saved stretch may already be shorter — and `now`
 * still wins, because a stretch cannot end in the future. */
export const applyStretchDrag = (
  kind: StretchDragKind,
  origin: StretchTimes,
  pointerAt: number,
  grabOffset: number,
  nowSec: number,
): StretchTimes => {
  if (kind === "move") {
    let startedAt = snapToQuarterHour(pointerAt - grabOffset);
    if (origin.endedAt === null) {
      return { startedAt: Math.min(startedAt, nowSec), endedAt: null };
    }
    const duration = origin.endedAt - origin.startedAt;
    let endedAt = startedAt + duration;
    if (endedAt > nowSec) {
      endedAt = nowSec;
      startedAt = endedAt - duration;
    }
    return { startedAt, endedAt };
  }

  if (kind === "start") {
    const latest =
      origin.endedAt === null
        ? nowSec
        : Math.min(nowSec, origin.endedAt - QUARTER_HOUR_SECONDS);
    return {
      startedAt: Math.min(snapToQuarterHour(pointerAt), latest),
      endedAt: origin.endedAt,
    };
  }

  if (origin.endedAt === null) return origin;
  const endedAt = Math.min(
    Math.max(snapToQuarterHour(pointerAt), origin.startedAt + QUARTER_HOUR_SECONDS),
    nowSec,
  );
  return { startedAt: origin.startedAt, endedAt };
};

const EDITOR_GAP = 8;
const VIEWPORT_PAD = 8;

export type StretchEditorBox = {
  top: number;
  left: number;
  width: number;
  side: "left" | "right";
};

/** Concurrent stretches prefer their outer edge so the editor does not cover
 * the sibling. A lone stretch has no preference — placement picks the side
 * with room. */
export const stretchEditorSide = (
  col: number,
  cols: number,
): "left" | "right" | null => {
  if (cols <= 1) return null;
  if (col === 0) return "left";
  if (col === cols - 1) return "right";
  return null;
};

/** Pin a fixed editor beside a stretch. Prefer `preferred` when both sides
 * fit; otherwise open toward whichever side has room, defaulting to the
 * right so a card near the left edge is not clipped. `size` is the editor's
 * measured box — CSS owns its resting width, so nothing is duplicated here. */
export const placeStretchEditor = (
  block: { top: number; left: number; right: number },
  viewport: { width: number; height: number },
  preferred: "left" | "right" | null,
  size: { width: number; height: number },
): StretchEditorBox => {
  const width = Math.min(
    size.width,
    Math.max(0, viewport.width - VIEWPORT_PAD * 2),
  );
  const height = Math.min(
    size.height,
    Math.max(0, viewport.height - VIEWPORT_PAD * 2),
  );
  const spaceRight = viewport.width - block.right - EDITOR_GAP - VIEWPORT_PAD;
  const spaceLeft = block.left - EDITOR_GAP - VIEWPORT_PAD;
  const rightFits = spaceRight >= width;
  const leftFits = spaceLeft >= width;
  const side: "left" | "right" =
    rightFits && leftFits
      ? (preferred ?? "right")
      : rightFits
        ? "right"
        : leftFits
          ? "left"
          : "right";
  const unclamped =
    side === "right" ? block.right + EDITOR_GAP : block.left - EDITOR_GAP - width;
  return {
    top: Math.max(
      VIEWPORT_PAD,
      Math.min(block.top, viewport.height - height - VIEWPORT_PAD),
    ),
    left: Math.max(
      VIEWPORT_PAD,
      Math.min(unclamped, viewport.width - width - VIEWPORT_PAD),
    ),
    width,
    side,
  };
};

/** Worked seconds per Task inside [from, to), busiest first. Clips each block
 * so an overnight stretch splits cleanly across calendar days. */
export const workTotalsInSpan = (
  blocks: WorkBlock[],
  from: number,
  to: number,
): { task: Task; seconds: number }[] => {
  const byTask = new Map<number, { task: Task; seconds: number }>();
  for (const block of blocks) {
    const seconds = Math.min(block.to, to) - Math.max(block.from, from);
    if (seconds <= 0) continue;
    const row = byTask.get(block.task.id);
    if (row) row.seconds += seconds;
    else byTask.set(block.task.id, { task: block.task, seconds });
  }
  return [...byTask.values()].sort(
    (a, b) => b.seconds - a.seconds || a.task.id - b.task.id,
  );
};
