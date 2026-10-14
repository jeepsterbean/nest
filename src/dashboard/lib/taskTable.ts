import { moveItem } from "../../lib/reorder";

export const TASK_VIEWS = [
  { key: "table", label: "Table" },
  { key: "map", label: "Map" },
] as const;

export type TaskViewKey = (typeof TASK_VIEWS)[number]["key"];

export const TASK_TABLE_COLUMNS = [
  { id: "title", label: "Title", width: 240, minWidth: 120 },
  { id: "scope", label: "Scope", width: 140, minWidth: 88 },
  { id: "parent", label: "Parent", width: 140, minWidth: 72 },
  { id: "status", label: "Status", width: 128, minWidth: 96 },
  { id: "value", label: "Value", width: 72, minWidth: 56 },
  { id: "effort", label: "Effort", width: 72, minWidth: 56 },
  { id: "workedTime", label: "Worked time", width: 100, minWidth: 72 },
  { id: "created", label: "Created", width: 100, minWidth: 72 },
  { id: "updated", label: "Updated", width: 100, minWidth: 72 },
  { id: "closed", label: "Closed", width: 100, minWidth: 72 },
] as const;

export type TaskTableColumnId = (typeof TASK_TABLE_COLUMNS)[number]["id"];

export type TaskTableColumn = {
  id: TaskTableColumnId;
  label: string;
  width: number;
  minWidth: number;
  hidden?: boolean;
};

/** Title names the row, so it stays visible. */
export const canHideTaskTableColumn = (id: TaskTableColumnId) => id !== "title";

const COLUMN_IDS = new Set<string>(TASK_TABLE_COLUMNS.map((column) => column.id));

const isColumnId = (value: unknown): value is TaskTableColumnId =>
  typeof value === "string" && COLUMN_IDS.has(value);

const clampWidth = (minWidth: number, width: number) =>
  Math.max(minWidth, Math.round(width));

/** A Map choice shows Table while Map is hidden. */
export const visibleTaskViewFor = (
  taskView: TaskViewKey,
  showTaskMap: boolean,
): TaskViewKey => (taskView === "map" && !showTaskMap ? "table" : taskView);

/** Drop unknown ids, append any new columns, and clamp widths to each min. */
export const normalizeTaskTableLayout = (stored: unknown): TaskTableColumn[] => {
  const record =
    stored && typeof stored === "object" ? (stored as { order?: unknown; widths?: unknown; hidden?: unknown }) : {};
  const storedOrder = Array.isArray(record.order) ? record.order : [];
  const storedWidths =
    record.widths && typeof record.widths === "object" && !Array.isArray(record.widths)
      ? (record.widths as Record<string, unknown>)
      : {};
  const storedHidden = new Set<unknown>(Array.isArray(record.hidden) ? record.hidden : []);

  const seen = new Set<TaskTableColumnId>();
  const order: TaskTableColumnId[] = [];
  for (const storedId of storedOrder) {
    const ids = storedId === "priority" ? ["value", "effort"] : [storedId];
    for (const id of ids) {
      if (!isColumnId(id) || seen.has(id)) continue;
      seen.add(id);
      order.push(id);
    }
  }
  for (const column of TASK_TABLE_COLUMNS) {
    if (seen.has(column.id)) continue;
    order.push(column.id);
  }

  const byId = new Map(TASK_TABLE_COLUMNS.map((column) => [column.id, column]));
  return order.map((id) => {
    const column = byId.get(id)!;
    const raw = storedWidths[id];
    const width = typeof raw === "number" && Number.isFinite(raw) ? raw : column.width;
    const hidden = storedHidden.has(id) && canHideTaskTableColumn(id);
    return { ...column, width: clampWidth(column.minWidth, width), ...(hidden ? { hidden } : {}) };
  });
};

/** The stored shape `normalizeTaskTableLayout` reads back; labels and minimums come from code. */
export const serializeTaskTableLayout = (columns: TaskTableColumn[]) => ({
  order: columns.map((column) => column.id),
  widths: Object.fromEntries(columns.map((column) => [column.id, column.width])),
  hidden: columns.filter((column) => column.hidden).map((column) => column.id),
});

export const sameTaskTableLayout = (a: TaskTableColumn[], b: TaskTableColumn[]) =>
  a.length === b.length &&
  a.every((column, index) => {
    const other = b[index]!;
    return column.id === other.id && column.width === other.width && Boolean(column.hidden) === Boolean(other.hidden);
  });

type FlexColumn = { index: number; weight: number; minWidth: number };

/** Scale visible columns to fill `availableWidth`. Hidden widths stay as weights. */
export const fitTaskTableColumns = (
  columns: TaskTableColumn[],
  availableWidth: number,
): TaskTableColumn[] => {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0) return columns;

  const items: FlexColumn[] = [];
  columns.forEach((column, index) => {
    if (column.hidden) return;
    items.push({
      index,
      weight: Math.max(column.width, column.minWidth),
      minWidth: column.minWidth,
    });
  });
  if (items.length === 0) return columns;

  const minSum = items.reduce((sum, item) => sum + item.minWidth, 0);
  const target = Math.max(Math.round(availableWidth), minSum);
  const currentSum = items.reduce((sum, item) => sum + columns[item.index]!.width, 0);
  if (currentSum === target && items.every((item) => columns[item.index]!.width >= item.minWidth)) {
    return columns;
  }

  const widths = allocateColumnWidths(items, target);
  return columns.map((column, index) => {
    const next = widths.get(index);
    return next === undefined || next === column.width ? column : { ...column, width: next };
  });
};

const allocateColumnWidths = (items: FlexColumn[], target: number): Map<number, number> => {
  const locked = new Set<number>();
  let remaining = target;

  let progressed = true;
  while (progressed && locked.size < items.length) {
    progressed = false;
    const flex = items.filter((item) => !locked.has(item.index));
    const weightSum = flex.reduce((sum, item) => sum + item.weight, 0);
    for (const item of flex) {
      const scaled = weightSum <= 0 ? remaining / flex.length : (item.weight / weightSum) * remaining;
      if (scaled < item.minWidth) {
        locked.add(item.index);
        remaining -= item.minWidth;
        progressed = true;
      }
    }
  }

  const assigned = new Map<number, number>();
  for (const item of items) {
    if (locked.has(item.index)) assigned.set(item.index, item.minWidth);
  }

  const flex = items.filter((item) => !locked.has(item.index));
  if (flex.length === 0) return assigned;

  const weightSum = flex.reduce((sum, item) => sum + item.weight, 0);
  const exacts = flex.map((item) =>
    weightSum <= 0 ? remaining / flex.length : (item.weight / weightSum) * remaining,
  );
  const bases = exacts.map((exact, index) => Math.max(flex[index]!.minWidth, Math.floor(exact)));
  let leftover = remaining - bases.reduce((sum, width) => sum + width, 0);
  const byRemainder = exacts
    .map((exact, index) => ({ index, frac: exact - Math.floor(exact) }))
    .sort((a, b) => b.frac - a.frac);
  for (const { index } of byRemainder) {
    if (leftover <= 0) break;
    bases[index] += 1;
    leftover -= 1;
  }
  flex.forEach((item, index) => assigned.set(item.index, bases[index]!));
  return assigned;
};

/** Grow `id` and shrink the next visible column by the same amount, stopping at each min. */
export const splitTaskTableColumn = (
  columns: TaskTableColumn[],
  id: TaskTableColumnId,
  delta: number,
): TaskTableColumn[] => {
  if (!Number.isFinite(delta)) return columns;
  const visible = columns.filter((column) => !column.hidden);
  const index = visible.findIndex((column) => column.id === id);
  const left = visible[index];
  const right = visible[index + 1];
  if (!left || !right) return columns;

  const applied = Math.max(
    left.minWidth - left.width,
    Math.min(Math.round(delta), right.width - right.minWidth),
  );
  if (applied === 0) return columns;
  return columns.map((column) => {
    if (column.id === left.id) return { ...column, width: left.width + applied };
    if (column.id === right.id) return { ...column, width: right.width - applied };
    return column;
  });
};

export const setTaskTableColumnHidden = (
  columns: TaskTableColumn[],
  id: TaskTableColumnId,
  hidden: boolean,
): TaskTableColumn[] =>
  columns.map((column) => {
    if (column.id !== id || (hidden && !canHideTaskTableColumn(id))) return column;
    const { hidden: _wasHidden, ...shown } = column;
    return hidden ? { ...shown, hidden: true } : shown;
  });

export const showAllTaskTableColumns = (columns: TaskTableColumn[]): TaskTableColumn[] =>
  columns.map(({ hidden: _wasHidden, ...column }) => column);

export const moveTaskTableColumn = (
  columns: TaskTableColumn[],
  draggedId: TaskTableColumnId,
  targetId: TaskTableColumnId,
): TaskTableColumn[] => {
  const ids = columns.map((column) => column.id);
  const next = moveItem(ids, ids.indexOf(draggedId), ids.indexOf(targetId));
  if (next === ids) return columns;
  const byId = new Map(columns.map((column) => [column.id, column]));
  return next.map((id) => byId.get(id)!);
};
