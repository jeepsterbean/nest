import { useCallback, useEffect, useState } from "react";

export const COLS = 12;
export const ROWS = 12;
export const OVERVIEW_LAYOUT_STORAGE_KEY = "nest:overview-layout";
// The key predates the Overview sidebar, when saved layouts were "snapshots".
export const SAVED_LAYOUTS_STORAGE_KEY = "nest:overview-layout-snapshots";
export const SAVED_LAYOUT_SELECTION_STORAGE_KEY =
  "nest:overview-layout-selection";
export const MAX_SAVED_LAYOUTS = 5;
export const DEFAULT_SAVED_LAYOUT_ICON = "layout-grid";

export const TILE_IDS = [
  "lastHour",
  "tasks",
  "timeline",
  "brainDump",
  "metrics",
  "controlPanel",
] as const;

export type TileId = (typeof TILE_IDS)[number];

export const TILE_LABELS: Record<TileId, string> = {
  lastHour: "Last hour",
  tasks: "Tasks",
  timeline: "Timeline",
  brainDump: "Brain dump",
  metrics: "Metric check-in",
  controlPanel: "Control panel",
};

/** DOM id shared by the Overview settings overlay and its Greetings board toggle. */
export const OVERVIEW_SETTINGS_ID = "overview-settings";

export type TileLayout = {
  id: TileId;
  x: number;
  y: number;
  w: number;
  h: number;
  minimised: boolean;
  expandedH?: number;
};

export type TileRect = Pick<TileLayout, "x" | "y" | "w" | "h">;

export type SavedLayout = {
  id: string;
  label: string;
  icon: string;
  /** When the layout was first saved. A later save does not change it, so the sidebar row stays put. */
  createdAt: number;
  savedAt: number;
  layout: TileLayout[];
};

/** Which saved layout the board was last loaded from or saved to, and whether
 *  the board has changed since. With no id the board belongs to no saved
 *  layout, so it always counts as edited. */
export type SavedLayoutSelection = { id: string | null; edited: boolean };

export type SavedLayoutProblem =
  | { kind: "blank" }
  | { kind: "full" }
  | { kind: "nameTaken" }
  | { kind: "duplicate"; match: SavedLayout };

export type SavedLayoutResult =
  | { ok: true; layouts: SavedLayout[] }
  | { ok: false; problem: SavedLayoutProblem };

export type TileRules = {
  minW?: number;
  minH?: number;
  resizable: boolean;
  minimisable: boolean;
  minimisedH?: number;
  fixed?: { w: number; h: number };
};

export const TILE_RULES: Record<TileId, TileRules> = {
  lastHour: { minW: 4, minH: 1, resizable: true, minimisable: false },
  tasks: {
    minW: 3,
    minH: 2,
    resizable: true,
    minimisable: true,
    minimisedH: 1,
  },
  timeline: {
    minW: 3,
    minH: 3,
    resizable: true,
    minimisable: true,
    minimisedH: 3,
  },
  brainDump: {
    minW: 3,
    minH: 2,
    resizable: true,
    minimisable: true,
    minimisedH: 1,
  },
  metrics: {
    resizable: false,
    minimisable: false,
    fixed: { w: 4, h: 2 },
  },
  controlPanel: { minW: 2, minH: 1, resizable: true, minimisable: false },
};

const CONTROL_PANEL_DEFAULT: TileLayout = {
  id: "controlPanel",
  x: 0,
  y: 11,
  w: 6,
  h: 1,
  minimised: false,
};

export const CONTROL_PANEL_ID: TileId = "controlPanel";

export const canHideTile = (id: TileId) => id !== CONTROL_PANEL_ID;

export const DEFAULT_LAYOUT: TileLayout[] = [
  { id: "lastHour", x: 0, y: 0, w: 8, h: 2, minimised: false },
  { id: "metrics", x: 8, y: 0, w: 4, h: 2, minimised: false },
  { id: "tasks", x: 0, y: 2, w: 6, h: 5, minimised: false },
  { id: "brainDump", x: 0, y: 7, w: 6, h: 4, minimised: false },
  { id: "timeline", x: 6, y: 2, w: 6, h: 10, minimised: false },
  CONTROL_PANEL_DEFAULT,
];

const cloneDefaultLayout = () => DEFAULT_LAYOUT.map((tile) => ({ ...tile }));

const isInteger = (value: unknown): value is number =>
  typeof value === "number" && Number.isInteger(value);

const isTileId = (value: unknown): value is TileId =>
  typeof value === "string" && TILE_IDS.includes(value as TileId);

const cloneLayout = (layout: TileLayout[]) => layout.map((tile) => ({ ...tile }));

const tileArea = ({ w, h }: TileRect) => w * h;

const isRectInBounds = ({ x, y, w, h }: TileRect) =>
  [x, y, w, h].every(Number.isInteger) &&
  x >= 0 &&
  y >= 0 &&
  w >= 1 &&
  h >= 1 &&
  x + w <= COLS &&
  y + h <= ROWS;

const minHeightForTile = (tile: Pick<TileLayout, "id" | "minimised">) => {
  const rules = TILE_RULES[tile.id];
  return tile.minimised && rules.minimisedH
    ? rules.minimisedH
    : (rules.minH ?? 1);
};

const isValidRectForTile = (
  tile: Pick<TileLayout, "id" | "minimised">,
  rect: TileRect,
) => {
  if (!isRectInBounds(rect)) return false;
  const rules = TILE_RULES[tile.id];
  if (rules.fixed) {
    return rect.w === rules.fixed.w && rect.h === rules.fixed.h;
  }
  return rect.w >= (rules.minW ?? 1) && rect.h >= minHeightForTile(tile);
};

const canPlaceTile = (placed: TileLayout[], tile: TileLayout, rect: TileRect) =>
  isValidRectForTile(tile, rect) &&
  placed.every((candidate) => candidate.id === tile.id || !overlaps(rect, candidate));

type PushDirection = { x: -1 | 0 | 1; y: -1 | 0 | 1 };

const candidateRectsForTile = (
  tile: TileLayout,
  push: PushDirection,
): TileRect[] => {
  const candidates: TileRect[] = [];
  const seen = new Set<string>();
  const addCandidate = (x: number, y: number) => {
    if (x < 0 || y < 0 || x > COLS - tile.w || y > ROWS - tile.h) return;
    const key = `${x}:${y}`;
    if (seen.has(key)) return;
    seen.add(key);
    candidates.push({ x, y, w: tile.w, h: tile.h });
  };

  if (push.x !== 0) {
    for (let step = 1; step < COLS; step += 1) {
      addCandidate(tile.x + push.x * step, tile.y);
    }
  }
  if (push.y !== 0) {
    for (let step = 1; step < ROWS; step += 1) {
      addCandidate(tile.x, tile.y + push.y * step);
    }
  }

  for (let y = 0; y <= ROWS - tile.h; y += 1) {
    for (let x = 0; x <= COLS - tile.w; x += 1) {
      addCandidate(x, y);
    }
  }
  const xDistance = (rect: TileRect) => rect.x - tile.x;
  const yDistance = (rect: TileRect) => rect.y - tile.y;
  const directionalPenalty = (distance: number, direction: -1 | 0 | 1) => {
    if (!direction) return 0;
    if (distance === 0) return 1;
    return Math.sign(distance) === direction ? 0 : 2;
  };
  return candidates.sort((a, b) => {
    const aX = xDistance(a);
    const bX = xDistance(b);
    const aY = yDistance(a);
    const bY = yDistance(b);

    if (push.x !== 0 && push.y === 0) {
      return (
        Math.abs(aY) - Math.abs(bY) ||
        directionalPenalty(aX, push.x) - directionalPenalty(bX, push.x) ||
        Math.abs(aX) - Math.abs(bX) ||
        a.y - b.y ||
        a.x - b.x
      );
    }

    if (push.y !== 0 && push.x === 0) {
      return (
        Math.abs(aX) - Math.abs(bX) ||
        directionalPenalty(aY, push.y) - directionalPenalty(bY, push.y) ||
        Math.abs(aY) - Math.abs(bY) ||
        a.y - b.y ||
        a.x - b.x
      );
    }

    const aPenalty =
      directionalPenalty(aX, push.x) + directionalPenalty(aY, push.y);
    const bPenalty =
      directionalPenalty(bX, push.x) + directionalPenalty(bY, push.y);
    if (aPenalty !== bPenalty) return aPenalty - bPenalty;

    const primaryAxis =
      push.x !== 0
        ? Math.abs(aX) - Math.abs(bX)
        : push.y !== 0
          ? Math.abs(aY) - Math.abs(bY)
          : 0;
    if (primaryAxis) return primaryAxis;

    const secondaryAxis =
      push.x !== 0
        ? Math.abs(aY) - Math.abs(bY)
        : Math.abs(aX) - Math.abs(bX);
    return (
      secondaryAxis ||
      Math.abs(aY) - Math.abs(bY) ||
      Math.abs(aX) - Math.abs(bX) ||
      a.y - b.y ||
      a.x - b.x
    );
  });
};

const sameRect = (a: TileRect, b: TileRect) =>
  a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;

const pushFromChange = (
  current: TileLayout,
  next: TileLayout,
): PushDirection => ({
  x:
    (Math.sign(next.w - current.w) || -Math.sign(next.x - current.x)) as
      | -1
      | 0
      | 1,
  y:
    (Math.sign(next.h - current.h) || -Math.sign(next.y - current.y)) as
      | -1
      | 0
      | 1,
});

function reflowLayout(
  layout: TileLayout[],
  id: TileId,
  update: (tile: TileLayout) => TileLayout,
): TileLayout[] | null {
  const current = layout.find((candidate) => candidate.id === id);
  if (!current) return null;

  const anchor = update(current);
  if (!canPlaceTile([], anchor, anchor)) return null;
  const totalArea = layout.reduce((area, candidate) => area + tileArea(candidate), 0);
  if (totalArea > COLS * ROWS) return null;
  const movableIds = new Set<TileId>([
    id,
    ...layout
      .filter((candidate) => candidate.id !== id && overlaps(anchor, candidate))
      .map((candidate) => candidate.id),
  ]);
  const stationaryIds = new Set<TileId>(
    layout
      .map((candidate) => candidate.id)
      .filter((candidateId) => !movableIds.has(candidateId)),
  );

  const byId = new Map(layout.map((candidate) => [candidate.id, { ...candidate }]));
  byId.set(id, anchor);
  const queue: Array<{ id: TileId; push: PushDirection }> = [
    { id, push: pushFromChange(current, anchor) },
  ];
  const locked = new Set<TileId>([id]);

  const findPlacement = (
    tile: TileLayout,
    push: PushDirection,
    blockedIds: Set<TileId>,
  ) => {
    const placed = Array.from(byId.values()).filter(
      (candidate) => candidate.id !== tile.id && blockedIds.has(candidate.id),
    );
    for (const rect of candidateRectsForTile(tile, push)) {
      if (sameRect(rect, tile)) continue;
      if (!canPlaceTile(placed, tile, rect)) continue;
      return rect;
    }
    return null;
  };

  while (queue.length) {
    const next = queue.shift()!;
    const source = byId.get(next.id);
    if (!source) return null;

    const overlapping = Array.from(movableIds)
      .filter((candidateId) => candidateId !== next.id)
      .filter((candidateId) =>
        overlaps(source, byId.get(candidateId)!),
      );

    for (const overlapId of overlapping) {
      const overlapTile = byId.get(overlapId);
      if (!overlapTile) return null;
      const blockedIds = new Set([...stationaryIds, ...locked]);
      blockedIds.add(next.id);
      const placement = findPlacement(overlapTile, next.push, blockedIds);
      if (!placement) return null;
      byId.set(overlapId, { ...overlapTile, ...placement });
      queue.push({ id: overlapId, push: next.push });
    }

    locked.add(next.id);
  }

  return layout.map((tile) => byId.get(tile.id) ?? tile);
}

const overlapArea = (a: TileRect, b: TileRect) =>
  Math.max(0, Math.min(a.x + a.w, b.x + b.w) - Math.max(a.x, b.x)) *
  Math.max(0, Math.min(a.y + a.h, b.y + b.h) - Math.max(a.y, b.y));

/**
 * The default board fills all 144 cells, so a push has no free rect to relocate
 * a displaced tile into and every drag would otherwise fail. Trading slots with
 * the most-covered tile keeps the board packed and rearrangeable. Minimised
 * tiles sit this out: their height is a collapsed state, not a slot to swap.
 */
function swapWithCoveredTile(
  layout: TileLayout[],
  tile: TileLayout,
  dx: number,
  dy: number,
): TileLayout[] | null {
  if (tile.minimised) return null;
  const target = { x: tile.x + dx, y: tile.y + dy, w: tile.w, h: tile.h };
  const partner = layout
    .filter((candidate) => candidate.id !== tile.id && !candidate.minimised)
    .map((candidate) => ({ candidate, area: overlapArea(target, candidate) }))
    .filter(({ area }) => area > 0)
    .sort((a, b) => b.area - a.area)[0]?.candidate;
  if (!partner) return null;

  const moved = { ...tile, x: partner.x, y: partner.y, w: partner.w, h: partner.h };
  const displaced = { ...partner, x: tile.x, y: tile.y, w: tile.w, h: tile.h };
  if (!isValidRectForTile(moved, moved) || !isValidRectForTile(displaced, displaced)) {
    return null;
  }
  return layout.map((candidate) =>
    candidate.id === moved.id
      ? moved
      : candidate.id === displaced.id
        ? displaced
        : candidate,
  );
}

export function previewMoveTile(
  layout: TileLayout[],
  id: TileId,
  dx: number,
  dy: number,
): TileLayout[] | null {
  const tile = layout.find((candidate) => candidate.id === id);
  if (!tile) return null;
  if (!dx && !dy) return cloneLayout(layout);
  const reflowed = reflowLayout(layout, id, (current) => ({
    ...current,
    x: current.x + dx,
    y: current.y + dy,
  }));
  return reflowed ?? swapWithCoveredTile(layout, tile, dx, dy);
}

export function previewResizeTile(
  layout: TileLayout[],
  id: TileId,
  dw: number,
  dh: number,
): TileLayout[] | null {
  const tile = layout.find((candidate) => candidate.id === id);
  const rules = TILE_RULES[id];
  if (!tile || !rules.resizable || tile.minimised) return null;
  if (!dw && !dh) return cloneLayout(layout);
  return reflowLayout(layout, id, (current) => ({
    ...current,
    w: Math.min(Math.max(current.w + dw, rules.minW ?? 1), COLS - current.x),
    h: Math.min(Math.max(current.h + dh, rules.minH ?? 1), ROWS - current.y),
  }));
}

export function overlaps(a: TileRect, b: TileRect): boolean {
  return (
    a.x < b.x + b.w &&
    a.x + a.w > b.x &&
    a.y < b.y + b.h &&
    a.y + a.h > b.y
  );
}

export function canPlace(
  layout: TileLayout[],
  id: TileId,
  rect: TileRect,
): boolean {
  const tile = layout.find((candidate) => candidate.id === id);
  return tile ? canPlaceTile(layout, tile, rect) : false;
}

export function findFreeSpot(
  layout: TileLayout[],
  w: number,
  h: number,
): TileRect | null {
  for (let y = 0; y <= ROWS - h; y += 1) {
    for (let x = 0; x <= COLS - w; x += 1) {
      const rect = { x, y, w, h };
      if (layout.every((tile) => !overlaps(rect, tile))) return rect;
    }
  }
  return null;
}

export function hiddenTileIds(layout: TileLayout[]): TileId[] {
  return TILE_IDS.filter(
    (id) => canHideTile(id) && !layout.some((tile) => tile.id === id),
  );
}

export function hideTile(layout: TileLayout[], id: TileId): TileLayout[] {
  if (!canHideTile(id)) return layout;
  return layout.filter((tile) => tile.id !== id);
}

export function restoredTileSize(id: TileId): TileRect {
  const rules = TILE_RULES[id];
  if (rules.fixed) return { x: 0, y: 0, ...rules.fixed };
  return {
    x: 0,
    y: 0,
    w: rules.minW ?? 1,
    h: rules.minimisable ? (rules.minimisedH ?? rules.minH ?? 1) : (rules.minH ?? 1),
  };
}

export function showTile(
  layout: TileLayout[],
  id: TileId,
  at?: Pick<TileRect, "x" | "y">,
): TileLayout[] {
  if (!hiddenTileIds(layout).includes(id)) return layout;

  const rules = TILE_RULES[id];
  const size = restoredTileSize(id);
  const tile: TileLayout = {
    id,
    x: at?.x ?? 0,
    y: at?.y ?? 0,
    w: size.w,
    h: size.h,
    minimised: rules.minimisable,
    expandedH: rules.minimisable ? (rules.minH ?? 1) : undefined,
  };

  if (at && isValidRectForTile(tile, { ...tile, x: at.x, y: at.y }) && !layout.some((candidate) => overlaps({ ...tile, x: at.x, y: at.y }, candidate))) {
    return [...layout, { ...tile, x: at.x, y: at.y }];
  }

  const free = findFreeSpot(layout, tile.w, tile.h);
  if (!free) return layout;
  return [...layout, { ...tile, ...free }];
}

export function canShowTile(layout: TileLayout[], id: TileId): boolean {
  const size = restoredTileSize(id);
  return findFreeSpot(layout, size.w, size.h) !== null;
}

function parseStoredTile(value: unknown): TileLayout | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    !isTileId(record.id) ||
    !isInteger(record.x) ||
    !isInteger(record.y) ||
    !isInteger(record.w) ||
    !isInteger(record.h) ||
    typeof record.minimised !== "boolean"
  ) {
    return null;
  }

  const rules = TILE_RULES[record.id];
  if (record.minimised && !rules.minimisable) return null;
  const tile: TileLayout = {
    id: record.id,
    x: record.x,
    y: record.y,
    w: record.w,
    h: record.h,
    minimised: record.minimised,
  };
  if (record.expandedH !== undefined) {
    if (!isInteger(record.expandedH)) return null;
    tile.expandedH = record.expandedH;
  }
  if (
    tile.minimised &&
    (tile.h !== rules.minimisedH ||
      tile.expandedH === undefined ||
      tile.expandedH < (rules.minH ?? 1))
  ) {
    return null;
  }
  return tile;
}

export function parseTileLayout(value: unknown): TileLayout[] {
  if (!Array.isArray(value)) return cloneDefaultLayout();

  const layout: TileLayout[] = [];
  for (const valueTile of value) {
    const tile = parseStoredTile(valueTile);
    if (!tile || layout.some((candidate) => candidate.id === tile.id)) continue;
    const candidateLayout = [...layout, tile];
    if (canPlace(candidateLayout, tile.id, tile)) layout.push(tile);
  }

  if (!layout.some((tile) => tile.id === CONTROL_PANEL_ID)) {
    const fallback = { ...CONTROL_PANEL_DEFAULT };
    const overlappingIds = layout
      .filter((tile) => overlaps(tile, fallback))
      .map((tile) => tile.id);
    const nextLayout = layout.filter((tile) => !overlappingIds.includes(tile.id));
    const candidateLayout = [...nextLayout, fallback];
    if (canPlace(candidateLayout, CONTROL_PANEL_ID, fallback)) {
      nextLayout.push(fallback);
      return nextLayout;
    }
    const free = findFreeSpot(nextLayout, fallback.w, fallback.h);
    if (free) {
      nextLayout.push({ ...fallback, ...free });
      return nextLayout;
    }
    return cloneDefaultLayout();
  }

  return layout;
}

export function readOverviewLayout(
  storage?: Pick<Storage, "getItem">,
): TileLayout[] {
  try {
    const target =
      storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return cloneDefaultLayout();
    const stored = target.getItem(OVERVIEW_LAYOUT_STORAGE_KEY);
    return stored === null
      ? cloneDefaultLayout()
      : parseTileLayout(JSON.parse(stored));
  } catch {
    return cloneDefaultLayout();
  }
}

export function writeOverviewLayout(
  layout: TileLayout[],
  storage?: Pick<Storage, "setItem">,
) {
  try {
    const target =
      storage ?? (typeof window === "undefined" ? null : window.localStorage);
    if (!target) return;
    target.setItem(OVERVIEW_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
  } catch {
    // Keep the board usable when storage is unavailable.
  }
}

const replaceTile = (
  layout: TileLayout[],
  id: TileId,
  update: (tile: TileLayout) => TileLayout,
) => layout.map((tile) => (tile.id === id ? update(tile) : tile));

export function moveTile(
  layout: TileLayout[],
  id: TileId,
  dx: number,
  dy: number,
): TileLayout[] {
  return previewMoveTile(layout, id, dx, dy) ?? layout;
}

export function resizeTile(
  layout: TileLayout[],
  id: TileId,
  dw: number,
  dh: number,
): TileLayout[] {
  return previewResizeTile(layout, id, dw, dh) ?? layout;
}

export function minimiseTile(layout: TileLayout[], id: TileId): TileLayout[] {
  const rules = TILE_RULES[id];
  if (!rules.minimisable || rules.minimisedH === undefined) return layout;
  return replaceTile(layout, id, (tile) =>
    tile.minimised
      ? tile
      : {
          ...tile,
          h: rules.minimisedH!,
          minimised: true,
          expandedH: tile.h,
        },
  );
}

export function expandTile(layout: TileLayout[], id: TileId): TileLayout[] {
  const tile = layout.find((candidate) => candidate.id === id);
  const rules = TILE_RULES[id];
  if (!tile?.minimised || !rules.minimisable) return layout;

  const targetHeight = Math.min(
    tile.expandedH ?? rules.minH ?? tile.h,
    ROWS,
  );
  const minHeight = rules.minH ?? 1;
  for (let h = targetHeight; h >= minHeight; h -= 1) {
    const expanded = reflowLayout(layout, id, () => ({
      ...tile,
      h,
      minimised: false,
      expandedH: undefined,
    }));
    if (expanded) return expanded;
  }
  return layout;
}

export function stackOrder(layout: TileLayout[]): TileLayout[] {
  return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}

function layoutsEqual(a: TileLayout[], b: TileLayout[]) {
  if (a.length !== b.length) return false;
  return a.every((tile) => {
    const other = b.find((candidate) => candidate.id === tile.id);
    return (
      other &&
      other.x === tile.x &&
      other.y === tile.y &&
      other.w === tile.w &&
      other.h === tile.h &&
      other.minimised === tile.minimised &&
      other.expandedH === tile.expandedH
    );
  });
}

function readStorage(storage?: Pick<Storage, "getItem">) {
  return storage ?? (typeof window === "undefined" ? null : window.localStorage);
}

function writeStorage(
  key: string,
  value: unknown,
  storage?: Pick<Storage, "setItem">,
) {
  try {
    const target =
      storage ?? (typeof window === "undefined" ? null : window.localStorage);
    target?.setItem(key, JSON.stringify(value));
  } catch {
    // Keep the board usable when storage is unavailable.
  }
}

function parseStoredSavedLayout(value: unknown): SavedLayout | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (
    typeof record.id !== "string" ||
    !record.id ||
    typeof record.label !== "string" ||
    !record.label.trim() ||
    !isInteger(record.savedAt)
  ) {
    return null;
  }
  return {
    id: record.id,
    label: record.label.trim(),
    // Layouts saved before the Overview sidebar have no icon.
    icon:
      typeof record.icon === "string" && record.icon
        ? record.icon
        : DEFAULT_SAVED_LAYOUT_ICON,
    // Layouts saved before creation time was stored use savedAt, which was that time.
    createdAt: isInteger(record.createdAt) ? record.createdAt : record.savedAt,
    savedAt: record.savedAt,
    layout: parseTileLayout(record.layout),
  };
}

/** Oldest first, so a re-save does not move a row. */
export function parseSavedLayouts(value: unknown): SavedLayout[] {
  if (!Array.isArray(value)) return [];
  const layouts: SavedLayout[] = [];
  for (const entry of value) {
    const saved = parseStoredSavedLayout(entry);
    if (!saved || layouts.some((candidate) => candidate.id === saved.id)) {
      continue;
    }
    layouts.push(saved);
  }
  return layouts
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, MAX_SAVED_LAYOUTS);
}

export function readSavedLayouts(
  storage?: Pick<Storage, "getItem">,
): SavedLayout[] {
  try {
    const stored = readStorage(storage)?.getItem(SAVED_LAYOUTS_STORAGE_KEY);
    return stored == null ? [] : parseSavedLayouts(JSON.parse(stored));
  } catch {
    return [];
  }
}

export function writeSavedLayouts(
  layouts: SavedLayout[],
  storage?: Pick<Storage, "setItem">,
) {
  writeStorage(SAVED_LAYOUTS_STORAGE_KEY, layouts, storage);
}

/** A stored selection must still name a saved layout. Without one stored
 *  (first launch after the sidebar shipped), adopt the saved layout the board
 *  already matches. */
export function parseSavedLayoutSelection(
  value: unknown,
  layouts: SavedLayout[],
  board: TileLayout[],
): SavedLayoutSelection {
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (
      typeof record.id === "string" &&
      layouts.some((saved) => saved.id === record.id)
    ) {
      return { id: record.id, edited: record.edited === true };
    }
    return { id: null, edited: true };
  }
  const match = findSavedLayoutMatch(layouts, board);
  return match ? { id: match.id, edited: false } : { id: null, edited: true };
}

export function readSavedLayoutSelection(
  layouts: SavedLayout[],
  board: TileLayout[],
  storage?: Pick<Storage, "getItem">,
): SavedLayoutSelection {
  try {
    const stored = readStorage(storage)?.getItem(
      SAVED_LAYOUT_SELECTION_STORAGE_KEY,
    );
    return parseSavedLayoutSelection(
      stored == null ? null : JSON.parse(stored),
      layouts,
      board,
    );
  } catch {
    return parseSavedLayoutSelection(null, layouts, board);
  }
}

export function writeSavedLayoutSelection(
  selection: SavedLayoutSelection,
  storage?: Pick<Storage, "setItem">,
) {
  writeStorage(SAVED_LAYOUT_SELECTION_STORAGE_KEY, selection, storage);
}

export function findSavedLayoutMatch(
  layouts: SavedLayout[],
  board: TileLayout[],
  exceptId?: string,
): SavedLayout | undefined {
  return layouts.find(
    (saved) => saved.id !== exceptId && layoutsEqual(saved.layout, board),
  );
}

const normalizeLabel = (label: string) => label.trim().toLocaleLowerCase();

const isLabelTaken = (layouts: SavedLayout[], label: string, exceptId?: string) =>
  layouts.some(
    (saved) =>
      saved.id !== exceptId && normalizeLabel(saved.label) === normalizeLabel(label),
  );

export function createSavedLayout(
  layouts: SavedLayout[],
  board: TileLayout[],
  label: string,
  icon: string,
  now = Date.now(),
): SavedLayoutResult {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, problem: { kind: "blank" } };
  if (layouts.length >= MAX_SAVED_LAYOUTS) {
    return { ok: false, problem: { kind: "full" } };
  }
  if (isLabelTaken(layouts, trimmed)) {
    return { ok: false, problem: { kind: "nameTaken" } };
  }
  const match = findSavedLayoutMatch(layouts, board);
  if (match) return { ok: false, problem: { kind: "duplicate", match } };
  const created: SavedLayout = {
    id: `layout-${now}`,
    label: trimmed,
    icon,
    createdAt: now,
    savedAt: now,
    layout: cloneLayout(board),
  };
  return { ok: true, layouts: [...layouts, created] };
}

export function overwriteSavedLayout(
  layouts: SavedLayout[],
  id: string,
  board: TileLayout[],
  now = Date.now(),
): SavedLayoutResult {
  const match = findSavedLayoutMatch(layouts, board, id);
  if (match) return { ok: false, problem: { kind: "duplicate", match } };
  return {
    ok: true,
    layouts: layouts.map((saved) =>
      saved.id === id
        ? { ...saved, savedAt: now, layout: cloneLayout(board) }
        : saved,
    ),
  };
}

export function renameSavedLayout(
  layouts: SavedLayout[],
  id: string,
  label: string,
): SavedLayoutResult {
  const trimmed = label.trim();
  if (!trimmed) return { ok: false, problem: { kind: "blank" } };
  if (isLabelTaken(layouts, trimmed, id)) {
    return { ok: false, problem: { kind: "nameTaken" } };
  }
  return {
    ok: true,
    layouts: layouts.map((saved) =>
      saved.id === id ? { ...saved, label: trimmed } : saved,
    ),
  };
}

export function pointerDeltaToCells(
  dxPx: number,
  dyPx: number,
  gridRect: Pick<DOMRect, "width" | "height">,
) {
  return {
    dx: Math.round(dxPx / (gridRect.width / COLS)),
    dy: Math.round(dyPx / (gridRect.height / ROWS)),
  };
}

export function pointerToCell(
  clientX: number,
  clientY: number,
  gridRect: Pick<DOMRect, "left" | "top" | "width" | "height">,
) {
  return {
    x: Math.min(
      Math.max(Math.floor((clientX - gridRect.left) / (gridRect.width / COLS)), 0),
      COLS - 1,
    ),
    y: Math.min(
      Math.max(Math.floor((clientY - gridRect.top) / (gridRect.height / ROWS)), 0),
      ROWS - 1,
    ),
  };
}

type OverviewBoard = { layout: TileLayout[]; selection: SavedLayoutSelection };

function readOverviewBoard(): OverviewBoard {
  const layout = readOverviewLayout();
  return { layout, selection: readSavedLayoutSelection(readSavedLayouts(), layout) };
}

export function useOverviewLayout() {
  const [savedLayouts, setSavedLayouts] = useState(readSavedLayouts);
  const [board, setBoard] = useState(readOverviewBoard);
  const { layout, selection } = board;

  useEffect(() => writeOverviewLayout(layout), [layout]);
  useEffect(() => writeSavedLayouts(savedLayouts), [savedLayouts]);
  useEffect(() => writeSavedLayoutSelection(selection), [selection]);

  // Any change the user makes to the board marks it edited. Saved layouts are
  // compared only when saving; a refused move leaves the board untouched.
  const editBoard = useCallback(
    (change: (current: TileLayout[]) => TileLayout[]) =>
      setBoard((current) => {
        const next = change(current.layout);
        if (layoutsEqual(next, current.layout)) return current;
        return { layout: next, selection: { ...current.selection, edited: true } };
      }),
    [],
  );

  const move = useCallback(
    (id: TileId, dx: number, dy: number) =>
      editBoard((current) => moveTile(current, id, dx, dy)),
    [editBoard],
  );
  const resize = useCallback(
    (id: TileId, dw: number, dh: number) =>
      editBoard((current) => resizeTile(current, id, dw, dh)),
    [editBoard],
  );
  const minimise = useCallback(
    (id: TileId) => editBoard((current) => minimiseTile(current, id)),
    [editBoard],
  );
  const expand = useCallback(
    (id: TileId) => editBoard((current) => expandTile(current, id)),
    [editBoard],
  );
  const hide = useCallback(
    (id: TileId) => editBoard((current) => hideTile(current, id)),
    [editBoard],
  );
  const show = useCallback(
    (id: TileId, at?: Pick<TileRect, "x" | "y">) =>
      editBoard((current) => showTile(current, id, at)),
    [editBoard],
  );
  const applyLayout = useCallback(
    (next: TileLayout[]) => editBoard(() => cloneLayout(next)),
    [editBoard],
  );

  const loadSavedLayout = useCallback(
    (id: string) => {
      const saved = savedLayouts.find((candidate) => candidate.id === id);
      if (!saved) return;
      setBoard({
        layout: cloneLayout(saved.layout),
        selection: { id, edited: false },
      });
    },
    [savedLayouts],
  );

  const saveSelectedLayout = useCallback((): SavedLayoutResult | null => {
    if (!selection.id) return null;
    const result = overwriteSavedLayout(savedLayouts, selection.id, layout);
    if (result.ok) {
      setSavedLayouts(result.layouts);
      setBoard((current) => ({
        ...current,
        selection: { ...current.selection, edited: false },
      }));
    }
    return result;
  }, [layout, savedLayouts, selection.id]);

  const createLayout = useCallback(
    (label: string, icon: string): SavedLayoutResult => {
      const result = createSavedLayout(savedLayouts, layout, label, icon);
      if (result.ok) {
        // New layouts are appended, so the last one is the layout just made.
        const created = result.layouts[result.layouts.length - 1]!;
        setSavedLayouts(result.layouts);
        setBoard((current) => ({
          ...current,
          selection: { id: created.id, edited: false },
        }));
      }
      return result;
    },
    [layout, savedLayouts],
  );

  const renameLayout = useCallback(
    (id: string, label: string): SavedLayoutResult => {
      const result = renameSavedLayout(savedLayouts, id, label);
      if (result.ok) setSavedLayouts(result.layouts);
      return result;
    },
    [savedLayouts],
  );

  const setLayoutIcon = useCallback(
    (id: string, icon: string) =>
      setSavedLayouts((current) =>
        current.map((saved) => (saved.id === id ? { ...saved, icon } : saved)),
      ),
    [],
  );

  // The board stays as it is; it just no longer belongs to a saved layout.
  const deleteLayout = useCallback((id: string) => {
    setSavedLayouts((current) => current.filter((saved) => saved.id !== id));
    setBoard((current) =>
      current.selection.id === id
        ? { ...current, selection: { id: null, edited: true } }
        : current,
    );
  }, []);

  return {
    layout,
    savedLayouts,
    selection,
    move,
    resize,
    minimise,
    expand,
    hide,
    show,
    applyLayout,
    loadSavedLayout,
    saveSelectedLayout,
    createLayout,
    renameLayout,
    setLayoutIcon,
    deleteLayout,
  };
}

export type OverviewLayoutController = ReturnType<typeof useOverviewLayout>;
