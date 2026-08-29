import { moveItem } from "../../lib/reorder";

export const TASK_VIEWS = [
  { key: "table", label: "Table" },
  { key: "kanban", label: "Kanban" },
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
] as const;

export type TaskTableColumnId = (typeof TASK_TABLE_COLUMNS)[number]["id"];

export type TaskTableColumn = {
  id: TaskTableColumnId;
  label: string;
  width: number;
  minWidth: number;
};

/** Overview Tasks peek: Status, Title, Value, Effort — read-only, Open/Closed. */
export const OVERVIEW_TASK_COLUMN_IDS: readonly TaskTableColumnId[] = [
  "status",
  "title",
  "value",
  "effort",
];

export const overviewTaskColumns = (): TaskTableColumn[] =>
  OVERVIEW_TASK_COLUMN_IDS.map((id) => {
    const column = TASK_TABLE_COLUMNS.find((item) => item.id === id)!;
    return { id: column.id, label: column.label, width: column.width, minWidth: column.minWidth };
  });

const TASK_VIEW_KEY = "nest:task-view";
const TASK_TABLE_KEY = "nest:task-table";
const COLUMN_IDS = new Set<string>(TASK_TABLE_COLUMNS.map((column) => column.id));
const MAX_COLUMN_WIDTH = 640;

type TaskStorage = Pick<Storage, "getItem" | "setItem">;

const isColumnId = (value: unknown): value is TaskTableColumnId =>
  typeof value === "string" && COLUMN_IDS.has(value);

const clampWidth = (minWidth: number, width: number) =>
  Math.min(MAX_COLUMN_WIDTH, Math.max(minWidth, Math.round(width)));

/** Table is the default Tasks layout. An unknown stored value falls back. */
export const readTaskView = (storage: TaskStorage = localStorage): TaskViewKey => {
  const stored = storage.getItem(TASK_VIEW_KEY);
  return stored === "kanban" || stored === "table" ? stored : "table";
};

export const writeTaskView = (
  key: TaskViewKey,
  storage: TaskStorage = localStorage,
) => {
  storage.setItem(TASK_VIEW_KEY, key);
};

/** Drop unknown ids, append any new columns, and clamp widths to each min/max. */
export const normalizeTaskTableLayout = (stored: unknown): TaskTableColumn[] => {
  const record =
    stored && typeof stored === "object" ? (stored as { order?: unknown; widths?: unknown }) : {};
  const storedOrder = Array.isArray(record.order) ? record.order : [];
  const storedWidths =
    record.widths && typeof record.widths === "object" && !Array.isArray(record.widths)
      ? (record.widths as Record<string, unknown>)
      : {};

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
    return { ...column, width: clampWidth(column.minWidth, width) };
  });
};

export const readTaskTableLayout = (
  storage: TaskStorage = localStorage,
): TaskTableColumn[] => {
  try {
    return normalizeTaskTableLayout(JSON.parse(storage.getItem(TASK_TABLE_KEY) ?? "null"));
  } catch {
    return normalizeTaskTableLayout(null);
  }
};

export const writeTaskTableLayout = (
  columns: TaskTableColumn[],
  storage: TaskStorage = localStorage,
) => {
  storage.setItem(
    TASK_TABLE_KEY,
    JSON.stringify({
      order: columns.map((column) => column.id),
      widths: Object.fromEntries(columns.map((column) => [column.id, column.width])),
    }),
  );
};

export const resizeTaskTableColumn = (
  columns: TaskTableColumn[],
  id: TaskTableColumnId,
  width: number,
): TaskTableColumn[] =>
  columns.map((column) =>
    column.id === id ? { ...column, width: clampWidth(column.minWidth, width) } : column,
  );

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
