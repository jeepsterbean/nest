import type { TaskStatus } from "../../lib/types";
import type { TaskColumnSort } from "./taskColumnSort";
import { TASK_DATE_PRESETS, type TaskDateFilter } from "./taskDateFilter";
import { isNestIconKey, NEST_ICONS, type NestIconKey } from "../components/PulseIcon";
import { normalizeScoreFilter, sameScoreFilter, type TaskScoreFilter } from "./taskScoreFilter";
import {
  normalizeTaskTableLayout,
  sameTaskTableLayout,
  serializeTaskTableLayout,
  TASK_TABLE_COLUMNS,
  type TaskTableColumn,
  type TaskTableColumnId,
} from "./taskTable";
import { TASK_STATUSES } from "./tasks";
import { normalizeWorkedTimeFilter, sameWorkedTimeFilter, type TaskWorkedTimeFilter } from "./taskWorkedTimeFilter";

export type TaskParentFilter = number | "none" | null;

/** Which Tasks the table shows, in what order, and through which columns: order, widths, and hidden. */
export type TaskTableQuery = {
  statuses: TaskStatus[];
  parent: TaskParentFilter;
  created: TaskDateFilter;
  updated: TaskDateFilter;
  closed: TaskDateFilter;
  workedOn: TaskDateFilter;
  statusChanged: TaskDateFilter;
  value: TaskScoreFilter;
  effort: TaskScoreFilter;
  workedTime: TaskWorkedTimeFilter;
  sort: TaskColumnSort[];
  /** Display only: groups the result under Parents without changing which Tasks match. */
  nested: boolean;
  columns: TaskTableColumn[];
};

export type SavedTaskView = { id: string; name: string; icon: NestIconKey; query: TaskTableQuery };

export type SavedTaskViewProblem =
  | { kind: "blank" }
  | { kind: "full" }
  | { kind: "nameTaken" }
  | { kind: "duplicate"; match: SavedTaskView };

export type SavedTaskViewResult =
  | { ok: true; views: SavedTaskView[] }
  | { ok: false; problem: SavedTaskViewProblem };

export type SavedTaskViewState = { views: SavedTaskView[]; selectedId: string };

// Short enough to scan at a glance in the picker.
export const MAX_SAVED_TASK_VIEWS = 10;

/** Fits the heading trigger and picker list; the heading name clips at 24ch. */
export const SAVED_TASK_VIEW_NAME_MAX = 24;

/** The built-in first view. Name and query stay locked, and it cannot be deleted, so the picker always has a home. */
export const RAW_TASK_VIEW_ID = "raw";

/** Previous undeletable home; dropped on load so Raw can take its place. */
const RETIRED_OPEN_TASK_VIEW_ID = "open";

export const DEFAULT_TASK_TABLE_QUERY: TaskTableQuery = {
  statuses: TASK_STATUSES,
  parent: null,
  created: null,
  updated: null,
  closed: null,
  workedOn: null,
  statusChanged: null,
  value: null,
  effort: null,
  workedTime: null,
  sort: [],
  nested: false,
  columns: normalizeTaskTableLayout(null),
};

const RAW_TASK_VIEW: SavedTaskView = {
  id: RAW_TASK_VIEW_ID,
  name: "Raw",
  icon: "layout-grid",
  query: DEFAULT_TASK_TABLE_QUERY,
};

/** Random among icons no saved view uses yet, so new views start visually distinct. */
const pickUnusedViewIcon = (views: SavedTaskView[], random = Math.random): NestIconKey => {
  const used = new Set(views.map((view) => view.icon));
  const free = NEST_ICONS.filter(({ key }) => !used.has(key));
  return (free[Math.floor(random() * free.length)] ?? NEST_ICONS[0]!).key;
};

/** Deterministic so a view saved before icons existed keeps the same icon across reloads until storage is rewritten. */
const migratedViewIcon = (id: string, used: Set<string>): NestIconKey => {
  let hash = 0;
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  for (let step = 0; step < NEST_ICONS.length; step += 1) {
    const { key } = NEST_ICONS[(hash + step) % NEST_ICONS.length]!;
    if (!used.has(key)) return key;
  }
  return NEST_ICONS[0]!.key;
};

const sameDateFilter = (a: TaskDateFilter, b: TaskDateFilter) =>
  JSON.stringify(a) === JSON.stringify(b);

const SAME_QUERY_FIELD: { [Field in keyof TaskTableQuery]: (a: TaskTableQuery[Field], b: TaskTableQuery[Field]) => boolean } = {
  // Status order is irrelevant: the filter is a set.
  statuses: (a, b) => a.length === b.length && a.every((status) => b.includes(status)),
  parent: (a, b) => a === b,
  created: sameDateFilter,
  updated: sameDateFilter,
  closed: sameDateFilter,
  workedOn: sameDateFilter,
  statusChanged: sameDateFilter,
  value: sameScoreFilter,
  effort: sameScoreFilter,
  workedTime: sameWorkedTimeFilter,
  sort: (a, b) => a.length === b.length && a.every((rule, index) => rule.column === b[index]?.column && rule.direction === b[index]?.direction),
  nested: (a, b) => a === b,
  columns: sameTaskTableLayout,
};

const QUERY_FIELDS = Object.keys(SAME_QUERY_FIELD) as (keyof TaskTableQuery)[];

/** Fields of `query` that differ from `saved`, so the active rules can mark what Save would change. */
export const changedTaskTableQueryFields = (saved: TaskTableQuery, query: TaskTableQuery) =>
  new Set(QUERY_FIELDS.filter((field) => !(SAME_QUERY_FIELD[field] as (a: unknown, b: unknown) => boolean)(saved[field], query[field])));

/** Query fields that select rows. */
export type TaskTableFilterField = Exclude<keyof TaskTableQuery, "sort" | "nested" | "columns">;

/** The filter each column header edits; Parent, Worked on, Status changed, and Worked time have no column. */
export const TASK_COLUMN_FILTER_FIELD: Partial<Record<TaskTableColumnId, TaskTableFilterField>> = {
  status: "statuses",
  created: "created",
  updated: "updated",
  closed: "closed",
  value: "value",
  effort: "effort",
};

const ROW_FILTER_FIELDS = QUERY_FIELDS.filter((field) => field !== "sort" && field !== "nested" && field !== "columns");

/** Whether any row-selection filter differs from the saved view.
 * Column layout and sorting do not count as filter edits. */
export const taskTableFiltersEdited = (
  saved: TaskTableQuery,
  query: TaskTableQuery,
) =>
  ROW_FILTER_FIELDS.some(
    (field) =>
      !(SAME_QUERY_FIELD[field] as (a: unknown, b: unknown) => boolean)(
        saved[field],
        query[field],
      ),
  );

/** True when this column's filter or sort rule differs from the saved view. */
export const taskTableColumnQueryEdited = (
  columnId: TaskTableColumnId,
  saved: TaskTableQuery,
  query: TaskTableQuery,
) => {
  const field = TASK_COLUMN_FILTER_FIELD[columnId];
  const filterEdited =
    field !== undefined &&
    !(SAME_QUERY_FIELD[field] as (a: unknown, b: unknown) => boolean)(saved[field], query[field]);
  const savedIndex = saved.sort.findIndex((rule) => rule.column === columnId);
  const queryIndex = query.sort.findIndex((rule) => rule.column === columnId);
  const sortEdited =
    savedIndex !== queryIndex || saved.sort[savedIndex]?.direction !== query.sort[queryIndex]?.direction;
  return filterEdited || sortEdited;
};

export const sameTaskTableQuery = (a: TaskTableQuery, b: TaskTableQuery) =>
  changedTaskTableQueryFields(a, b).size === 0;

const clipName = (name: string) => name.trim().slice(0, SAVED_TASK_VIEW_NAME_MAX).trim();

const normalizeName = (name: string) => name.trim().toLocaleLowerCase();

const isNameTaken = (views: SavedTaskView[], name: string, exceptId?: string) =>
  views.some((view) => view.id !== exceptId && normalizeName(view.name) === normalizeName(name));

const findQueryMatch = (views: SavedTaskView[], query: TaskTableQuery, exceptId?: string) =>
  views.find((view) => view.id !== exceptId && sameTaskTableQuery(view.query, query));

export function createSavedTaskView(
  views: SavedTaskView[],
  query: TaskTableQuery,
  name: string,
  now = Date.now(),
  random = Math.random,
): SavedTaskViewResult {
  const trimmed = clipName(name);
  if (!trimmed) return { ok: false, problem: { kind: "blank" } };
  if (views.length >= MAX_SAVED_TASK_VIEWS) return { ok: false, problem: { kind: "full" } };
  if (isNameTaken(views, trimmed)) return { ok: false, problem: { kind: "nameTaken" } };
  const match = findQueryMatch(views, query);
  if (match) return { ok: false, problem: { kind: "duplicate", match } };
  return { ok: true, views: [...views, { id: `view-${now}`, name: trimmed, icon: pickUnusedViewIcon(views, random), query }] };
}

export function overwriteSavedTaskView(
  views: SavedTaskView[],
  id: string,
  query: TaskTableQuery,
): SavedTaskViewResult {
  if (id === RAW_TASK_VIEW_ID) return { ok: true, views };
  const match = findQueryMatch(views, query, id);
  if (match) return { ok: false, problem: { kind: "duplicate", match } };
  return { ok: true, views: views.map((view) => (view.id === id ? { ...view, query } : view)) };
}

export function renameSavedTaskView(
  views: SavedTaskView[],
  id: string,
  name: string,
): SavedTaskViewResult {
  if (id === RAW_TASK_VIEW_ID) return { ok: true, views };
  const trimmed = clipName(name);
  if (!trimmed) return { ok: false, problem: { kind: "blank" } };
  if (isNameTaken(views, trimmed, id)) return { ok: false, problem: { kind: "nameTaken" } };
  return { ok: true, views: views.map((view) => (view.id === id ? { ...view, name: trimmed } : view)) };
}

export const setSavedTaskViewIcon = (views: SavedTaskView[], id: string, icon: NestIconKey) =>
  id === RAW_TASK_VIEW_ID ? views : views.map((view) => (view.id === id ? { ...view, icon } : view));

export const deleteSavedTaskView = (views: SavedTaskView[], id: string) =>
  id === RAW_TASK_VIEW_ID ? views : views.filter((view) => view.id !== id);

const TASK_TABLE_VIEWS_KEY = "nest:task-table-views";
const DATE_PRESET_KEYS = new Set<unknown>(TASK_DATE_PRESETS.map((preset) => preset.key));
const COLUMN_IDS = new Set<unknown>(TASK_TABLE_COLUMNS.map((column) => column.id));

type TaskStorage = Pick<Storage, "getItem" | "setItem">;
type Loose = Record<string, unknown>;

const isRecord = (value: unknown): value is Loose =>
  Boolean(value) && typeof value === "object" && !Array.isArray(value);

const dayOrNull = (value: unknown) => (typeof value === "string" ? value : null);

const normalizeDateFilter = (value: unknown): TaskDateFilter => {
  if (!isRecord(value)) return null;
  if (value.kind === "preset" && DATE_PRESET_KEYS.has(value.preset)) {
    return { kind: "preset", preset: value.preset as Extract<TaskDateFilter, { kind: "preset" }>["preset"] };
  }
  if (value.kind === "range") {
    const fromDay = dayOrNull(value.fromDay);
    const toDay = dayOrNull(value.toDay);
    return fromDay === null && toDay === null ? null : { kind: "range", fromDay, toDay };
  }
  return null;
};

const normalizeSort = (value: unknown): TaskColumnSort | null => {
  if (!isRecord(value) || !COLUMN_IDS.has(value.column)) return null;
  if (value.direction !== "ascending" && value.direction !== "descending") return null;
  return { column: value.column as TaskColumnSort["column"], direction: value.direction };
};

const normalizeQuery = (value: unknown): TaskTableQuery => {
  if (!isRecord(value)) return { ...DEFAULT_TASK_TABLE_QUERY };
  const statuses = Array.isArray(value.statuses)
    ? TASK_STATUSES.filter((status) => (value.statuses as unknown[]).includes(status))
    : DEFAULT_TASK_TABLE_QUERY.statuses;
  const parent = value.parent;
  return {
    statuses,
    parent: parent === "none" || (typeof parent === "number" && Number.isInteger(parent)) ? parent : null,
    created: normalizeDateFilter(value.created),
    updated: normalizeDateFilter(value.updated),
    closed: normalizeDateFilter(value.closed),
    workedOn: normalizeDateFilter(value.workedOn),
    statusChanged: normalizeDateFilter(value.statusChanged),
    value: normalizeScoreFilter(value.value),
    effort: normalizeScoreFilter(value.effort),
    workedTime: normalizeWorkedTimeFilter(value.workedTime),
    sort: (Array.isArray(value.sort) ? value.sort : [value.sort])
      .map(normalizeSort)
      .filter((rule): rule is TaskColumnSort => rule !== null)
      .filter((rule, index, rules) => rules.findIndex(other => other.column === rule.column) === index),
    nested: value.nested === true,
    columns: normalizeTaskTableLayout(value.columns),
  };
};

/** Drop malformed rows and repeated names or ids, keep at most the cap, and always lead with Raw. */
export const normalizeSavedTaskViews = (stored: unknown): SavedTaskViewState => {
  const record = isRecord(stored) ? stored : {};
  const rows = Array.isArray(record.views) ? record.views : [];
  const views: SavedTaskView[] = [];
  const usedIcons = new Set<string>([RAW_TASK_VIEW.icon]);
  for (const row of rows) {
    if (isRecord(row) && isNestIconKey(row.icon)) usedIcons.add(row.icon);
  }
  for (const row of rows) {
    if (!isRecord(row) || typeof row.id !== "string" || typeof row.name !== "string") continue;
    if (row.id === RETIRED_OPEN_TASK_VIEW_ID || row.id === RAW_TASK_VIEW_ID) continue;
    const name = clipName(row.name);
    if (
      !name
      || views.some((view) => view.id === row.id)
      || isNameTaken(views, name)
      || normalizeName(name) === normalizeName(RAW_TASK_VIEW.name)
    ) continue;
    const icon = isNestIconKey(row.icon) ? row.icon : migratedViewIcon(row.id, usedIcons);
    usedIcons.add(icon);
    views.push({ id: row.id, name, icon, query: normalizeQuery(row.query) });
  }
  // Always inject the locked empty home rather than replaying a stored Raw row.
  views.unshift({ ...RAW_TASK_VIEW, query: { ...RAW_TASK_VIEW.query } });
  const capped = views.slice(0, MAX_SAVED_TASK_VIEWS);
  const selectedId =
    typeof record.selectedId === "string" && capped.some((view) => view.id === record.selectedId)
      ? record.selectedId
      : RAW_TASK_VIEW_ID;
  return { views: capped, selectedId };
};

export const readSavedTaskViews = (storage: TaskStorage = localStorage): SavedTaskViewState => {
  try {
    return normalizeSavedTaskViews(JSON.parse(storage.getItem(TASK_TABLE_VIEWS_KEY) ?? "null"));
  } catch {
    return normalizeSavedTaskViews(null);
  }
};

export const writeSavedTaskViews = (state: SavedTaskViewState, storage: TaskStorage = localStorage) => {
  try {
    const views = state.views.map((view) => ({
      ...view,
      query: { ...view.query, columns: serializeTaskTableLayout(view.query.columns) },
    }));
    storage.setItem(TASK_TABLE_VIEWS_KEY, JSON.stringify({ ...state, views }));
  } catch {
    // Storage can be full or blocked; the views still work for this session.
  }
};
