/** Map layout: which open Tasks sit on the grid and where. Position is the
 * user's arrangement only; Blocker lines and Blocked styling come from the
 * task graph, never from where a card sits. */

// ponytail: fixed column count; make it track board width if cards get cramped.
export const MAP_COLS = 6;
export const MAP_ROW_HEIGHT = 84;
export const TASK_MAP_STORAGE_KEY = "nest:task-map";
const MIN_ROWS = 4;

export type MapCell = { x: number; y: number };
/** Task id → cell. Tasks absent here sit in the Map tray. */
export type TaskMapLayout = Record<string, MapCell>;

type MapStorage = Pick<Storage, "getItem" | "setItem">;

const isCell = (value: unknown): value is MapCell =>
  typeof value === "object" &&
  value !== null &&
  Number.isInteger((value as MapCell).x) &&
  Number.isInteger((value as MapCell).y) &&
  (value as MapCell).x >= 0 &&
  (value as MapCell).x < MAP_COLS &&
  (value as MapCell).y >= 0;

const cellKey = (cell: MapCell) => `${cell.x},${cell.y}`;

export function parseTaskMapLayout(value: unknown): TaskMapLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const layout: TaskMapLayout = {};
  const taken = new Set<string>();
  for (const [id, cell] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || !isCell(cell) || taken.has(cellKey(cell))) continue;
    taken.add(cellKey(cell));
    layout[id] = { x: cell.x, y: cell.y };
  }
  return layout;
}

export const readTaskMapLayout = (
  storage: MapStorage = localStorage,
): TaskMapLayout => {
  try {
    return parseTaskMapLayout(JSON.parse(storage.getItem(TASK_MAP_STORAGE_KEY) ?? "null"));
  } catch {
    return {};
  }
};

export const writeTaskMapLayout = (
  layout: TaskMapLayout,
  storage: MapStorage = localStorage,
) => {
  storage.setItem(TASK_MAP_STORAGE_KEY, JSON.stringify(layout));
};

/** Rows to draw: one spare row under the lowest card so there is always room to drop. */
export const mapRowCount = (layout: TaskMapLayout): number => {
  let lowest = -1;
  for (const cell of Object.values(layout)) lowest = Math.max(lowest, cell.y);
  return Math.max(MIN_ROWS, lowest + 2);
};

/** Put the task at `cell`, or at the nearest free cell when another task holds it. */
export function placeOnMap(
  layout: TaskMapLayout,
  taskId: number,
  cell: MapCell,
): TaskMapLayout {
  const id = String(taskId);
  const wanted = {
    x: Math.min(MAP_COLS - 1, Math.max(0, cell.x)),
    y: Math.max(0, cell.y),
  };
  const taken = new Set<string>();
  for (const [otherId, other] of Object.entries(layout)) {
    if (otherId !== id) taken.add(cellKey(other));
  }
  if (!taken.has(cellKey(wanted))) return { ...layout, [id]: wanted };

  // The spare row is always empty, so a free cell exists within rowCount + 1.
  const rows = mapRowCount(layout) + 1;
  let best: MapCell | null = null;
  let bestDistance = Infinity;
  for (let y = 0; y < rows; y += 1) {
    for (let x = 0; x < MAP_COLS; x += 1) {
      if (taken.has(`${x},${y}`)) continue;
      const distance = Math.abs(x - wanted.x) + Math.abs(y - wanted.y);
      if (distance < bestDistance) {
        bestDistance = distance;
        best = { x, y };
      }
    }
  }
  return { ...layout, [id]: best ?? { x: 0, y: rows } };
}

export function removeFromMap(layout: TaskMapLayout, taskId: number): TaskMapLayout {
  const id = String(taskId);
  if (!(id in layout)) return layout;
  const { [id]: _removed, ...rest } = layout;
  return rest;
}

/** Drop cards whose task no longer exists. Returns the same object when nothing changed. */
export function pruneTaskMapLayout(
  layout: TaskMapLayout,
  liveIds: Set<number>,
): TaskMapLayout {
  const kept = Object.entries(layout).filter(([id]) => liveIds.has(Number(id)));
  return kept.length === Object.keys(layout).length
    ? layout
    : Object.fromEntries(kept);
}
