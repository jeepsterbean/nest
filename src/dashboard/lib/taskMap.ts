/** Map layout: where each placed Task's entity box sits on the board, in board
 * pixels from the top-left, plus the pan/zoom the board is viewed through.
 * Free-form — boxes go wherever they are dropped and may overlap. Relation
 * lines come from the task graph, never from where a box
 * sits. */

export const MAP_CARD_WIDTH = 216;
/** A canvas far larger than any viewport, so arrangements have room to spread. */
export const MAP_BOARD_WIDTH = 6000;
export const MAP_BOARD_HEIGHT = 4000;
/** v1 stored grid cells (x 0-5), which would render stacked as pixel positions.
 * Old layouts are deliberately dropped rather than migrated: one re-arrange
 * beats guessing pixel positions from cells. */
export const TASK_MAP_STORAGE_KEY = "nest:task-map-v2";
export const TASK_MAP_VIEW_STORAGE_KEY = "nest:task-map-view";
export const MIN_ZOOM = 0.25;
export const MAX_ZOOM = 2;
/** Keep a dropped box fully on the canvas: its own size, roughly. */
const CARD_KEEP_IN_VIEW = { x: MAP_CARD_WIDTH, y: 120 };
/** Cascade attempts before a click-placed box settles wherever it landed. */
const CASCADE_STEP_LIMIT = 64;

export type MapPoint = { x: number; y: number };
/** Task id → board position. Tasks absent here sit in the Map sidebar. */
export type TaskMapLayout = Record<string, MapPoint>;
/** Board pixel at the viewport's top-left, and the scale it is drawn at. */
export type MapView = { x: number; y: number; zoom: number };

export const DEFAULT_MAP_VIEW: MapView = { x: 0, y: 0, zoom: 1 };

type MapStorage = Pick<Storage, "getItem" | "setItem">;

const isPoint = (value: unknown): value is MapPoint =>
  typeof value === "object" &&
  value !== null &&
  Number.isFinite((value as MapPoint).x) &&
  Number.isFinite((value as MapPoint).y);

const clampToBoard = (point: MapPoint): MapPoint => ({
  x: Math.round(Math.min(MAP_BOARD_WIDTH - CARD_KEEP_IN_VIEW.x, Math.max(0, point.x))),
  y: Math.round(Math.min(MAP_BOARD_HEIGHT - CARD_KEEP_IN_VIEW.y, Math.max(0, point.y))),
});

export function parseTaskMapLayout(value: unknown): TaskMapLayout {
  if (!value || typeof value !== "object" || Array.isArray(value)) return {};
  const layout: TaskMapLayout = {};
  for (const [id, point] of Object.entries(value as Record<string, unknown>)) {
    if (!/^\d+$/.test(id) || !isPoint(point)) continue;
    layout[id] = clampToBoard(point);
  }
  return layout;
}

export const readTaskMapLayout = (
  storage: MapStorage = localStorage,
): TaskMapLayout => {
  try {
    return parseTaskMapLayout(
      JSON.parse(storage.getItem(TASK_MAP_STORAGE_KEY) ?? "null"),
    );
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

export function placeOnMap(
  layout: TaskMapLayout,
  taskId: number,
  point: MapPoint,
): TaskMapLayout {
  return { ...layout, [String(taskId)]: clampToBoard(point) };
}

/** Where a click-placed box lands: cascading down-right, clear of other boxes.
 * Near the board's bottom edge every candidate clamps to the same point, so the
 * search is bounded and the last candidate is accepted even if it overlaps. */
export function cascadeSpot(layout: TaskMapLayout, origin: MapPoint = { x: 24, y: 24 }): MapPoint {
  const taken = Object.values(layout);
  let spot = clampToBoard(origin);
  for (let step = 0; step < CASCADE_STEP_LIMIT; step += 1) {
    spot = clampToBoard({ x: origin.x + (step % 5) * 32, y: origin.y + step * 30 });
    const clear = !taken.some(
      (point) => Math.abs(point.x - spot.x) < 16 && Math.abs(point.y - spot.y) < 16,
    );
    if (clear) break;
  }
  return spot;
}

export function removeFromMap(layout: TaskMapLayout, taskId: number): TaskMapLayout {
  const id = String(taskId);
  if (!(id in layout)) return layout;
  const { [id]: _removed, ...rest } = layout;
  return rest;
}

/** Drop boxes whose task no longer exists. Returns the same object when nothing changed. */
export function pruneTaskMapLayout(
  layout: TaskMapLayout,
  liveIds: Set<number>,
): TaskMapLayout {
  const kept = Object.entries(layout).filter(([id]) => liveIds.has(Number(id)));
  return kept.length === Object.keys(layout).length
    ? layout
    : Object.fromEntries(kept);
}

/* ---------- Pan and zoom ---------- */

export const clampZoom = (zoom: number) =>
  Math.min(MAX_ZOOM, Math.max(MIN_ZOOM, zoom));

/** Viewport pixel → board pixel. */
export const toBoardPoint = (view: MapView, viewportPoint: MapPoint): MapPoint => ({
  x: (viewportPoint.x - view.x) / view.zoom,
  y: (viewportPoint.y - view.y) / view.zoom,
});

/** Scale about a viewport point, keeping the board pixel under it in place. */
export function zoomAround(
  view: MapView,
  factor: number,
  viewportPoint: MapPoint,
): MapView {
  const zoom = clampZoom(view.zoom * factor);
  const anchor = toBoardPoint(view, viewportPoint);
  return {
    zoom,
    x: viewportPoint.x - anchor.x * zoom,
    y: viewportPoint.y - anchor.y * zoom,
  };
}

/** Keep the canvas covering the viewport: no panning off into blank space. */
export function clampMapView(
  view: MapView,
  viewport: { width: number; height: number },
): MapView {
  return {
    zoom: view.zoom,
    x: Math.min(0, Math.max(viewport.width - MAP_BOARD_WIDTH * view.zoom, view.x)),
    y: Math.min(0, Math.max(viewport.height - MAP_BOARD_HEIGHT * view.zoom, view.y)),
  };
}

export function parseMapView(value: unknown): MapView {
  if (!isPoint(value) || !Number.isFinite((value as MapView).zoom)) {
    return DEFAULT_MAP_VIEW;
  }
  const view = value as MapView;
  return { x: view.x, y: view.y, zoom: clampZoom(view.zoom) };
}

export const readTaskMapView = (storage: MapStorage = localStorage): MapView => {
  try {
    return parseMapView(
      JSON.parse(storage.getItem(TASK_MAP_VIEW_STORAGE_KEY) ?? "null"),
    );
  } catch {
    return DEFAULT_MAP_VIEW;
  }
};

export const writeTaskMapView = (
  view: MapView,
  storage: MapStorage = localStorage,
) => {
  storage.setItem(TASK_MAP_VIEW_STORAGE_KEY, JSON.stringify(view));
};

export type MapBox = { x: number; y: number; width: number; height: number };
export type MapEdgePorts = { from: MapPoint; to: MapPoint; d: string };

/** Orthogonal ERD-style connector between two boxes, leaving each from the
 * side that faces the other. */
export function connectorPath(from: MapBox, to: MapBox): MapEdgePorts {
  const fromCenter = { x: from.x + from.width / 2, y: from.y + from.height / 2 };
  const toCenter = { x: to.x + to.width / 2, y: to.y + to.height / 2 };
  const dx = toCenter.x - fromCenter.x;
  const dy = toCenter.y - fromCenter.y;

  if (Math.abs(dx) >= Math.abs(dy)) {
    const start = { x: dx >= 0 ? from.x + from.width : from.x, y: fromCenter.y };
    const end = { x: dx >= 0 ? to.x : to.x + to.width, y: toCenter.y };
    const mid = (start.x + end.x) / 2;
    return {
      from: start,
      to: end,
      d: `M${start.x} ${start.y} H${mid} V${end.y} H${end.x}`,
    };
  }
  const start = { x: fromCenter.x, y: dy >= 0 ? from.y + from.height : from.y };
  const end = { x: toCenter.x, y: dy >= 0 ? to.y : to.y + to.height };
  const mid = (start.y + end.y) / 2;
  return {
    from: start,
    to: end,
    d: `M${start.x} ${start.y} V${mid} H${end.x} V${end.y}`,
  };
}
