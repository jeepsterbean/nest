import { useCallback, useEffect, useState } from "react";
export const COLS = 12;
export const ROWS = 12;
export const OVERVIEW_LAYOUT_STORAGE_KEY = "nest:overview-layout";
export const OVERVIEW_LAYOUT_SNAPSHOTS_STORAGE_KEY = "nest:overview-layout-snapshots";
export const MAX_OVERVIEW_LAYOUT_SNAPSHOTS = 5;
export const TILE_IDS = [
    "lastHour",
    "tasks",
    "timeline",
    "brainDump",
    "metrics",
    "controlPanel",
];
export const TILE_LABELS = {
    lastHour: "Last hour",
    tasks: "Tasks",
    timeline: "Timeline",
    brainDump: "Brain dump",
    metrics: "Metric check-in",
    controlPanel: "Control panel",
};
export const TILE_RULES = {
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
const CONTROL_PANEL_DEFAULT = {
    id: "controlPanel",
    x: 0,
    y: 11,
    w: 6,
    h: 1,
    minimised: false,
};
export const CONTROL_PANEL_ID = "controlPanel";
export const canHideTile = (id) => id !== CONTROL_PANEL_ID;
export const DEFAULT_LAYOUT = [
    { id: "lastHour", x: 0, y: 0, w: 8, h: 2, minimised: false },
    { id: "metrics", x: 8, y: 0, w: 4, h: 2, minimised: false },
    { id: "tasks", x: 0, y: 2, w: 6, h: 5, minimised: false },
    { id: "brainDump", x: 0, y: 7, w: 6, h: 4, minimised: false },
    { id: "timeline", x: 6, y: 2, w: 6, h: 10, minimised: false },
    CONTROL_PANEL_DEFAULT,
];
const cloneDefaultLayout = () => DEFAULT_LAYOUT.map((tile) => ({ ...tile }));
const isInteger = (value) => typeof value === "number" && Number.isInteger(value);
const isTileId = (value) => typeof value === "string" && TILE_IDS.includes(value);
const cloneLayout = (layout) => layout.map((tile) => ({ ...tile }));
const tileArea = ({ w, h }) => w * h;
const isRectInBounds = ({ x, y, w, h }) => [x, y, w, h].every(Number.isInteger) &&
    x >= 0 &&
    y >= 0 &&
    w >= 1 &&
    h >= 1 &&
    x + w <= COLS &&
    y + h <= ROWS;
const minHeightForTile = (tile) => {
    const rules = TILE_RULES[tile.id];
    return tile.minimised && rules.minimisedH
        ? rules.minimisedH
        : (rules.minH ?? 1);
};
const isValidRectForTile = (tile, rect) => {
    if (!isRectInBounds(rect))
        return false;
    const rules = TILE_RULES[tile.id];
    if (rules.fixed) {
        return rect.w === rules.fixed.w && rect.h === rules.fixed.h;
    }
    return rect.w >= (rules.minW ?? 1) && rect.h >= minHeightForTile(tile);
};
const canPlaceTile = (placed, tile, rect) => isValidRectForTile(tile, rect) &&
    placed.every((candidate) => candidate.id === tile.id || !overlaps(rect, candidate));
const candidateRectsForTile = (tile, push) => {
    const candidates = [];
    const seen = new Set();
    const addCandidate = (x, y) => {
        if (x < 0 || y < 0 || x > COLS - tile.w || y > ROWS - tile.h)
            return;
        const key = `${x}:${y}`;
        if (seen.has(key))
            return;
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
    const xDistance = (rect) => rect.x - tile.x;
    const yDistance = (rect) => rect.y - tile.y;
    const directionalPenalty = (distance, direction) => {
        if (!direction)
            return 0;
        if (distance === 0)
            return 1;
        return Math.sign(distance) === direction ? 0 : 2;
    };
    return candidates.sort((a, b) => {
        const aX = xDistance(a);
        const bX = xDistance(b);
        const aY = yDistance(a);
        const bY = yDistance(b);
        if (push.x !== 0 && push.y === 0) {
            return (Math.abs(aY) - Math.abs(bY) ||
                directionalPenalty(aX, push.x) - directionalPenalty(bX, push.x) ||
                Math.abs(aX) - Math.abs(bX) ||
                a.y - b.y ||
                a.x - b.x);
        }
        if (push.y !== 0 && push.x === 0) {
            return (Math.abs(aX) - Math.abs(bX) ||
                directionalPenalty(aY, push.y) - directionalPenalty(bY, push.y) ||
                Math.abs(aY) - Math.abs(bY) ||
                a.y - b.y ||
                a.x - b.x);
        }
        const aPenalty = directionalPenalty(aX, push.x) + directionalPenalty(aY, push.y);
        const bPenalty = directionalPenalty(bX, push.x) + directionalPenalty(bY, push.y);
        if (aPenalty !== bPenalty)
            return aPenalty - bPenalty;
        const primaryAxis = push.x !== 0
            ? Math.abs(aX) - Math.abs(bX)
            : push.y !== 0
                ? Math.abs(aY) - Math.abs(bY)
                : 0;
        if (primaryAxis)
            return primaryAxis;
        const secondaryAxis = push.x !== 0
            ? Math.abs(aY) - Math.abs(bY)
            : Math.abs(aX) - Math.abs(bX);
        return (secondaryAxis ||
            Math.abs(aY) - Math.abs(bY) ||
            Math.abs(aX) - Math.abs(bX) ||
            a.y - b.y ||
            a.x - b.x);
    });
};
const sameRect = (a, b) => a.x === b.x && a.y === b.y && a.w === b.w && a.h === b.h;
const pushFromChange = (current, next) => ({
    x: (Math.sign(next.w - current.w) || -Math.sign(next.x - current.x)),
    y: (Math.sign(next.h - current.h) || -Math.sign(next.y - current.y)),
});
function reflowLayout(layout, id, update) {
    const current = layout.find((candidate) => candidate.id === id);
    if (!current)
        return null;
    const anchor = update(current);
    if (!canPlaceTile([], anchor, anchor))
        return null;
    const totalArea = layout.reduce((area, candidate) => area + tileArea(candidate), 0);
    if (totalArea > COLS * ROWS)
        return null;
    const byId = new Map(layout.map((candidate) => [candidate.id, { ...candidate }]));
    byId.set(id, anchor);
    const queue = [
        { id, push: pushFromChange(current, anchor) },
    ];
    const locked = new Set([id]);
    const findPlacement = (tile, push, blockedIds) => {
        const placed = Array.from(byId.values()).filter((candidate) => candidate.id !== tile.id && blockedIds.has(candidate.id));
        for (const rect of candidateRectsForTile(tile, push)) {
            if (sameRect(rect, tile))
                continue;
            if (!canPlaceTile(placed, tile, rect))
                continue;
            return rect;
        }
        return null;
    };
    while (queue.length) {
        const next = queue.shift();
        const source = byId.get(next.id);
        if (!source)
            return null;
        const overlapping = layout
            .map((candidate) => candidate.id)
            .filter((candidateId) => candidateId !== next.id)
            .filter((candidateId) => overlaps(source, byId.get(candidateId)));
        for (const overlapId of overlapping) {
            const overlapTile = byId.get(overlapId);
            if (!overlapTile)
                return null;
            const blockedIds = new Set(locked);
            blockedIds.add(next.id);
            const placement = findPlacement(overlapTile, next.push, blockedIds);
            if (!placement)
                return null;
            byId.set(overlapId, { ...overlapTile, ...placement });
            queue.push({ id: overlapId, push: next.push });
        }
        locked.add(next.id);
    }
    return layout.map((tile) => byId.get(tile.id) ?? tile);
}
export function previewMoveTile(layout, id, dx, dy) {
    const tile = layout.find((candidate) => candidate.id === id);
    if (!tile)
        return null;
    if (!dx && !dy)
        return cloneLayout(layout);
    return reflowLayout(layout, id, (current) => ({
        ...current,
        x: current.x + dx,
        y: current.y + dy,
    }));
}
export function previewResizeTile(layout, id, dw, dh) {
    const tile = layout.find((candidate) => candidate.id === id);
    const rules = TILE_RULES[id];
    if (!tile || !rules.resizable || tile.minimised)
        return null;
    if (!dw && !dh)
        return cloneLayout(layout);
    return reflowLayout(layout, id, (current) => ({
        ...current,
        w: Math.min(Math.max(current.w + dw, rules.minW ?? 1), COLS - current.x),
        h: Math.min(Math.max(current.h + dh, rules.minH ?? 1), ROWS - current.y),
    }));
}
export function overlaps(a, b) {
    return (a.x < b.x + b.w &&
        a.x + a.w > b.x &&
        a.y < b.y + b.h &&
        a.y + a.h > b.y);
}
export function canPlace(layout, id, rect) {
    const tile = layout.find((candidate) => candidate.id === id);
    return tile ? canPlaceTile(layout, tile, rect) : false;
}
export function findFreeSpot(layout, w, h) {
    for (let y = 0; y <= ROWS - h; y += 1) {
        for (let x = 0; x <= COLS - w; x += 1) {
            const rect = { x, y, w, h };
            if (layout.every((tile) => !overlaps(rect, tile)))
                return rect;
        }
    }
    return null;
}
export function hiddenTileIds(layout) {
    return TILE_IDS.filter((id) => canHideTile(id) && !layout.some((tile) => tile.id === id));
}
export function hideTile(layout, id) {
    if (!canHideTile(id))
        return layout;
    return layout.filter((tile) => tile.id !== id);
}
export function restoredTileSize(id) {
    const rules = TILE_RULES[id];
    if (rules.fixed)
        return { x: 0, y: 0, ...rules.fixed };
    return {
        x: 0,
        y: 0,
        w: rules.minW ?? 1,
        h: rules.minimisable ? (rules.minimisedH ?? rules.minH ?? 1) : (rules.minH ?? 1),
    };
}
export function showTile(layout, id, at) {
    if (!hiddenTileIds(layout).includes(id))
        return layout;
    const rules = TILE_RULES[id];
    const size = restoredTileSize(id);
    const tile = {
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
    if (!free)
        return layout;
    return [...layout, { ...tile, ...free }];
}
export function canShowTile(layout, id) {
    const size = restoredTileSize(id);
    return findFreeSpot(layout, size.w, size.h) !== null;
}
function parseStoredTile(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    if (!isTileId(record.id) ||
        !isInteger(record.x) ||
        !isInteger(record.y) ||
        !isInteger(record.w) ||
        !isInteger(record.h) ||
        typeof record.minimised !== "boolean") {
        return null;
    }
    const rules = TILE_RULES[record.id];
    if (record.minimised && !rules.minimisable)
        return null;
    const tile = {
        id: record.id,
        x: record.x,
        y: record.y,
        w: record.w,
        h: record.h,
        minimised: record.minimised,
    };
    if (record.expandedH !== undefined) {
        if (!isInteger(record.expandedH))
            return null;
        tile.expandedH = record.expandedH;
    }
    if (tile.minimised &&
        (tile.h !== rules.minimisedH ||
            tile.expandedH === undefined ||
            tile.expandedH < (rules.minH ?? 1))) {
        return null;
    }
    return tile;
}
export function parseTileLayout(value) {
    if (!Array.isArray(value))
        return cloneDefaultLayout();
    const layout = [];
    for (const valueTile of value) {
        const tile = parseStoredTile(valueTile);
        if (!tile || layout.some((candidate) => candidate.id === tile.id))
            continue;
        const candidateLayout = [...layout, tile];
        if (canPlace(candidateLayout, tile.id, tile))
            layout.push(tile);
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
export function readOverviewLayout(storage) {
    try {
        const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
        if (!target)
            return cloneDefaultLayout();
        const stored = target.getItem(OVERVIEW_LAYOUT_STORAGE_KEY);
        return stored === null
            ? cloneDefaultLayout()
            : parseTileLayout(JSON.parse(stored));
    }
    catch {
        return cloneDefaultLayout();
    }
}
export function writeOverviewLayout(layout, storage) {
    try {
        const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
        if (!target)
            return;
        target.setItem(OVERVIEW_LAYOUT_STORAGE_KEY, JSON.stringify(layout));
    }
    catch {
        // Keep the board usable when storage is unavailable.
    }
}
const replaceTile = (layout, id, update) => layout.map((tile) => (tile.id === id ? update(tile) : tile));
export function moveTile(layout, id, dx, dy) {
    return previewMoveTile(layout, id, dx, dy) ?? layout;
}
export function resizeTile(layout, id, dw, dh) {
    return previewResizeTile(layout, id, dw, dh) ?? layout;
}
export function minimiseTile(layout, id) {
    const rules = TILE_RULES[id];
    if (!rules.minimisable || rules.minimisedH === undefined)
        return layout;
    return replaceTile(layout, id, (tile) => tile.minimised
        ? tile
        : {
            ...tile,
            h: rules.minimisedH,
            minimised: true,
            expandedH: tile.h,
        });
}
export function expandTile(layout, id) {
    const tile = layout.find((candidate) => candidate.id === id);
    const rules = TILE_RULES[id];
    if (!tile?.minimised || !rules.minimisable)
        return layout;
    const targetHeight = Math.min(tile.expandedH ?? rules.minH ?? tile.h, ROWS);
    const minHeight = rules.minH ?? 1;
    for (let h = targetHeight; h >= minHeight; h -= 1) {
        const expanded = reflowLayout(layout, id, () => ({
            ...tile,
            h,
            minimised: false,
            expandedH: undefined,
        }));
        if (expanded)
            return expanded;
    }
    return layout;
}
export function stackOrder(layout) {
    return [...layout].sort((a, b) => a.y - b.y || a.x - b.x);
}
function layoutsEqual(a, b) {
    if (a.length !== b.length)
        return false;
    return a.every((tile) => {
        const other = b.find((candidate) => candidate.id === tile.id);
        return (other &&
            other.x === tile.x &&
            other.y === tile.y &&
            other.w === tile.w &&
            other.h === tile.h &&
            other.minimised === tile.minimised &&
            other.expandedH === tile.expandedH);
    });
}
function formatSnapshotLabel(savedAt) {
    return new Intl.DateTimeFormat("en", {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
    }).format(savedAt);
}
function parseStoredSnapshot(value) {
    if (!value || typeof value !== "object")
        return null;
    const record = value;
    if (typeof record.id !== "string" ||
        !record.id ||
        typeof record.label !== "string" ||
        !record.label.trim() ||
        !isInteger(record.savedAt)) {
        return null;
    }
    const layout = parseTileLayout(record.layout);
    return {
        id: record.id,
        label: record.label.trim(),
        savedAt: record.savedAt,
        layout,
    };
}
export function parseOverviewLayoutSnapshots(value) {
    if (!Array.isArray(value))
        return [];
    const snapshots = [];
    for (const entry of value) {
        const snapshot = parseStoredSnapshot(entry);
        if (!snapshot || snapshots.some((candidate) => candidate.id === snapshot.id)) {
            continue;
        }
        snapshots.push(snapshot);
    }
    return snapshots
        .sort((a, b) => b.savedAt - a.savedAt)
        .slice(0, MAX_OVERVIEW_LAYOUT_SNAPSHOTS)
        .map((snapshot) => ({ ...snapshot, layout: cloneLayout(snapshot.layout) }));
}
export function readOverviewLayoutSnapshots(storage) {
    try {
        const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
        if (!target)
            return [];
        const stored = target.getItem(OVERVIEW_LAYOUT_SNAPSHOTS_STORAGE_KEY);
        return stored === null ? [] : parseOverviewLayoutSnapshots(JSON.parse(stored));
    }
    catch {
        return [];
    }
}
export function writeOverviewLayoutSnapshots(snapshots, storage) {
    try {
        const target = storage ?? (typeof window === "undefined" ? null : window.localStorage);
        if (!target)
            return;
        target.setItem(OVERVIEW_LAYOUT_SNAPSHOTS_STORAGE_KEY, JSON.stringify(snapshots));
    }
    catch {
        // Keep the board usable when storage is unavailable.
    }
}
export function buildOverviewLayoutSnapshot(layout, now = Date.now()) {
    return {
        id: `snapshot-${now}`,
        label: formatSnapshotLabel(now),
        savedAt: now,
        layout: cloneLayout(layout),
    };
}
export function saveOverviewLayoutSnapshot(snapshots, layout, now = Date.now()) {
    const nextSnapshot = buildOverviewLayoutSnapshot(layout, now);
    const deduped = snapshots.filter((snapshot) => !layoutsEqual(snapshot.layout, nextSnapshot.layout));
    return [nextSnapshot, ...deduped].slice(0, MAX_OVERVIEW_LAYOUT_SNAPSHOTS);
}
export function pointerDeltaToCells(dxPx, dyPx, gridRect) {
    return {
        dx: Math.round(dxPx / (gridRect.width / COLS)),
        dy: Math.round(dyPx / (gridRect.height / ROWS)),
    };
}
export function pointerToCell(clientX, clientY, gridRect) {
    return {
        x: Math.min(Math.max(Math.floor((clientX - gridRect.left) / (gridRect.width / COLS)), 0), COLS - 1),
        y: Math.min(Math.max(Math.floor((clientY - gridRect.top) / (gridRect.height / ROWS)), 0), ROWS - 1),
    };
}
export function useOverviewLayout() {
    const [layout, setLayout] = useState(readOverviewLayout);
    const [snapshots, setSnapshots] = useState(readOverviewLayoutSnapshots);
    useEffect(() => writeOverviewLayout(layout), [layout]);
    useEffect(() => writeOverviewLayoutSnapshots(snapshots), [snapshots]);
    const move = useCallback((id, dx, dy) => setLayout((current) => moveTile(current, id, dx, dy)), []);
    const resize = useCallback((id, dw, dh) => setLayout((current) => resizeTile(current, id, dw, dh)), []);
    const minimise = useCallback((id) => setLayout((current) => minimiseTile(current, id)), []);
    const expand = useCallback((id) => setLayout((current) => expandTile(current, id)), []);
    const hide = useCallback((id) => setLayout((current) => hideTile(current, id)), []);
    const show = useCallback((id, at) => setLayout((current) => showTile(current, id, at)), []);
    const restoreSnapshot = useCallback((snapshotId) => {
        setSnapshots((current) => {
            const snapshot = current.find((candidate) => candidate.id === snapshotId);
            if (snapshot)
                setLayout(cloneLayout(snapshot.layout));
            return current;
        });
    }, []);
    const saveSnapshot = useCallback(() => setSnapshots((current) => saveOverviewLayoutSnapshot(current, layout)), [layout]);
    const applyLayout = useCallback((next) => {
        setLayout(cloneLayout(next));
    }, []);
    const activeSnapshotId = snapshots.find((snapshot) => layoutsEqual(snapshot.layout, layout))?.id ?? "";
    return {
        layout,
        snapshots,
        activeSnapshotId,
        move,
        resize,
        minimise,
        expand,
        hide,
        show,
        applyLayout,
        restoreSnapshot,
        saveSnapshot,
    };
}
