import { describe, expect, it } from "vitest";
import {
  changedTaskTableQueryFields,
  createSavedTaskView,
  taskTableColumnQueryEdited,
  taskTableFiltersEdited,
  DEFAULT_TASK_TABLE_QUERY,
  deleteSavedTaskView,
  MAX_SAVED_TASK_VIEWS,
  normalizeSavedTaskViews,
  RAW_TASK_VIEW_ID,
  SAVED_TASK_VIEW_NAME_MAX,
  overwriteSavedTaskView,
  readSavedTaskViews,
  renameSavedTaskView,
  sameTaskTableQuery,
  writeSavedTaskViews,
  type SavedTaskView,
  type TaskTableQuery,
} from "../../../src/dashboard/lib/taskTableViews";
import { setTaskTableColumnHidden, splitTaskTableColumn } from "../../../src/dashboard/lib/taskTable";

const query = (fields: Partial<TaskTableQuery>): TaskTableQuery => ({ ...DEFAULT_TASK_TABLE_QUERY, ...fields });
const raw = normalizeSavedTaskViews(null).views;
const viewsOf = (result: ReturnType<typeof createSavedTaskView>): SavedTaskView[] => {
  if (!result.ok) throw new Error(result.problem.kind);
  return result.views;
};

describe("saved task views", () => {
  it("discards retired Scope filters, sorts, and columns from stored views", () => {
    const state = normalizeSavedTaskViews({
      selectedId: "legacy",
      views: [{ id: "legacy", name: "Legacy", query: {
        scope: "Work", parent: 7, statuses: ["active"],
        sort: [{ column: "scope", direction: "ascending" }, { column: "title", direction: "descending" }],
        columns: { order: ["title", "scope", "parent"], widths: { scope: 200 }, hidden: ["scope"] },
      } }],
    });
    const saved = state.views.find(view => view.id === "legacy")!;
    expect(saved.query).not.toHaveProperty("scope");
    expect(saved.query.parent).toBe(7);
    expect(saved.query.statuses).toEqual(["active"]);
    expect(saved.query.sort).toEqual([{ column: "title", direction: "descending" }]);
    expect(saved.query.columns.map(column => column.id)).not.toContain("scope");
  });

  it("starts with the built-in Raw view selected", () => {
    expect(normalizeSavedTaskViews(null)).toEqual({
      views: [{ id: RAW_TASK_VIEW_ID, name: "Raw", query: DEFAULT_TASK_TABLE_QUERY }],
      selectedId: RAW_TASK_VIEW_ID,
    });
  });

  it("drops the retired Open built-in and selects Raw", () => {
    const state = normalizeSavedTaskViews({
      selectedId: "open",
      views: [
        { id: "open", name: "Inbox", query: { statuses: ["active"] } },
        { id: "a", name: "Focus", query: { statuses: ["completed"] } },
      ],
    });
    expect(state.selectedId).toBe(RAW_TASK_VIEW_ID);
    expect(state.views.map(view => view.id)).toEqual([RAW_TASK_VIEW_ID, "a"]);
    expect(state.views[0]).toEqual({ id: RAW_TASK_VIEW_ID, name: "Raw", query: DEFAULT_TASK_TABLE_QUERY });
    expect(state.views[1]!.query.statuses).toEqual(["completed"]);
    expect(normalizeSavedTaskViews({
      selectedId: "a",
      views: [
        { id: "open", name: "Open", query: { statuses: ["active"] } },
        { id: "a", name: "Focus", query: { statuses: ["completed"] } },
      ],
    }).selectedId).toBe("a");
  });

  it("compares statuses as a set", () => {
    expect(sameTaskTableQuery(query({ statuses: ["active", "backlog"] }), query({ statuses: ["backlog", "active"] }))).toBe(true);
    expect(sameTaskTableQuery(query({ sort: [{ column: "value", direction: "ascending" }] }), query({}))).toBe(false);
    expect(sameTaskTableQuery(query({ nested: true }), query({}))).toBe(false);
  });

  it("names only the fields that differ from the saved query", () => {
    const saved = query({ effort: { kind: "scores", scores: [4, 5] } });
    const current = query({ effort: { kind: "scores", scores: [4, 5] }, parent: 1 });
    expect(changedTaskTableQueryFields(saved, current)).toEqual(new Set(["parent"]));
  });

  it("marks a column edited only when its own filter or sort differs from the saved view", () => {
    const saved = query({
      value: { kind: "scores", scores: [4] },
      sort: [{ column: "title", direction: "ascending" }, { column: "status", direction: "descending" }],
    });
    expect(taskTableColumnQueryEdited("value", saved, saved)).toBe(false);
    expect(taskTableColumnQueryEdited("title", saved, saved)).toBe(false);
    expect(taskTableColumnQueryEdited("status", saved, saved)).toBe(false);
    expect(taskTableColumnQueryEdited("value", saved, query({ ...saved, value: { kind: "scores", scores: [5] } }))).toBe(true);
    expect(taskTableColumnQueryEdited("title", saved, query({
      ...saved,
      sort: [{ column: "title", direction: "descending" }, { column: "status", direction: "descending" }],
    }))).toBe(true);
    expect(taskTableColumnQueryEdited("status", saved, query({
      ...saved,
      sort: [{ column: "status", direction: "descending" }, { column: "title", direction: "ascending" }],
    }))).toBe(true);
    expect(taskTableColumnQueryEdited("title", saved, query({ ...saved, value: { kind: "scores", scores: [5] } }))).toBe(false);
  });

  it("keeps filter changes visible when a saved filter is cleared", () => {
    const saved = query({ effort: { kind: "scores", scores: [2] } });
    const cleared = query({ ...saved, effort: null });
    expect(taskTableFiltersEdited(saved, cleared)).toBe(true);
    expect(taskTableColumnQueryEdited("effort", saved, cleared)).toBe(true);
  });

  it("does not treat sort or column-only edits as filter changes", () => {
    const sorted = query({ sort: [{ column: "title", direction: "ascending" }] });
    const hidden = setTaskTableColumnHidden(DEFAULT_TASK_TABLE_QUERY.columns, "created", true);
    expect(taskTableFiltersEdited(DEFAULT_TASK_TABLE_QUERY, sorted)).toBe(false);
    expect(taskTableFiltersEdited(DEFAULT_TASK_TABLE_QUERY, query({ columns: hidden }))).toBe(false);
  });

  it("refuses blank names, names taken ignoring case, and a query another view already holds", () => {
    expect(createSavedTaskView(raw, query({ parent: 1 }), "  ")).toEqual({ ok: false, problem: { kind: "blank" } });
    expect(createSavedTaskView(raw, query({ parent: 1 }), "raw")).toEqual({ ok: false, problem: { kind: "nameTaken" } });
    expect(createSavedTaskView(raw, DEFAULT_TASK_TABLE_QUERY, "Mine")).toEqual({ ok: false, problem: { kind: "duplicate", match: raw[0] } });
  });

  it("stops at the cap", () => {
    let views = raw;
    for (let i = 1; i < MAX_SAVED_TASK_VIEWS; i++) views = viewsOf(createSavedTaskView(views, query({ parent: i }), `View ${i}`, i));
    expect(createSavedTaskView(views, query({ parent: 99 }), "More")).toEqual({ ok: false, problem: { kind: "full" } });
  });

  it("overwrites, renames, and never changes Raw", () => {
    const views = viewsOf(createSavedTaskView(raw, query({ parent: 1 }), "Health", 1));
    const saved = viewsOf(overwriteSavedTaskView(views, "view-1", query({ parent: 2 })));
    expect(saved[1]!.query.parent).toBe(2);
    expect(overwriteSavedTaskView(views, "view-1", DEFAULT_TASK_TABLE_QUERY)).toMatchObject({ ok: false, problem: { kind: "duplicate" } });
    expect(viewsOf(renameSavedTaskView(views, "view-1", " Body "))[1]!.name).toBe("Body");
    expect(renameSavedTaskView(views, "view-1", "RAW")).toEqual({ ok: false, problem: { kind: "nameTaken" } });
    expect(overwriteSavedTaskView(views, RAW_TASK_VIEW_ID, query({ parent: 1 }))).toEqual({ ok: true, views });
    expect(renameSavedTaskView(views, RAW_TASK_VIEW_ID, "Inbox")).toEqual({ ok: true, views });
    expect(deleteSavedTaskView(views, RAW_TASK_VIEW_ID)).toBe(views);
    expect(deleteSavedTaskView(views, "view-1")).toEqual(raw);
  });

  it("clips names to the picker width", () => {
    const long = "A".repeat(SAVED_TASK_VIEW_NAME_MAX + 4);
    expect(viewsOf(createSavedTaskView(raw, query({ parent: 1 }), long, 1))[1]!.name).toBe("A".repeat(SAVED_TASK_VIEW_NAME_MAX));
  });

  it("drops malformed stored fields and restores Raw", () => {
    const state = normalizeSavedTaskViews({
      selectedId: "missing",
      views: [
        { id: "a", name: "Focus", query: { statuses: ["active", "paused"], parent: 1.5, created: { kind: "preset", preset: "yesterday" }, updated: { kind: "range", fromDay: "2026-01-01", toDay: 3 }, sort: { column: "nope", direction: "ascending" } } },
        { id: "b", name: "focus" },
        { name: "No id" },
      ],
    });
    expect(state.selectedId).toBe(RAW_TASK_VIEW_ID);
    expect(state.views.map(view => view.id)).toEqual([RAW_TASK_VIEW_ID, "a"]);
    expect(state.views[1]!.query).toEqual({
      statuses: ["active"], parent: null, created: null,
      updated: { kind: "range", fromDay: "2026-01-01", toDay: null },
      closed: null, value: null, effort: null, workedOn: null, statusChanged: null, workedTime: null, sort: [], nested: false,
      columns: DEFAULT_TASK_TABLE_QUERY.columns,
    });
  });

  it("keeps Value, Effort, and Worked time in the saved query", () => {
    const withScores = query({
      value: { kind: "scores", scores: [4, 5] },
      effort: { kind: "none" },
      workedTime: { comparator: "more", seconds: 1800 },
    });
    expect(sameTaskTableQuery(withScores, query({}))).toBe(false);
    const state = normalizeSavedTaskViews({
      selectedId: "a",
      views: [{ id: "a", name: "Focus", query: withScores }],
    });
    expect(state.views.find(view => view.id === "a")!.query.value).toEqual({ kind: "scores", scores: [4, 5] });
    expect(state.views.find(view => view.id === "a")!.query.effort).toEqual({ kind: "none" });
    expect(state.views.find(view => view.id === "a")!.query.workedTime).toEqual({ comparator: "more", seconds: 1800 });
  });

  it("restores a stored Raw row to the locked empty built-in", () => {
    const state = normalizeSavedTaskViews({
      selectedId: RAW_TASK_VIEW_ID,
      views: [{ id: RAW_TASK_VIEW_ID, name: "Inbox", query: query({ parent: 1, value: { kind: "scores", scores: [5] } }) }],
    });
    expect(state.views[0]).toEqual({ id: RAW_TASK_VIEW_ID, name: "Raw", query: DEFAULT_TASK_TABLE_QUERY });
  });

  it("keeps column order, widths, and hidden columns in the saved query", () => {
    const hidden = setTaskTableColumnHidden(DEFAULT_TASK_TABLE_QUERY.columns, "created", true);
    expect(changedTaskTableQueryFields(DEFAULT_TASK_TABLE_QUERY, query({ columns: hidden }))).toEqual(new Set(["columns"]));
    const resized = splitTaskTableColumn(hidden, "title", 30);
    expect(sameTaskTableQuery(query({ columns: hidden }), query({ columns: resized }))).toBe(false);
    const views = viewsOf(createSavedTaskView(raw, query({ columns: hidden }), "Lean", 3));
    expect(views[1]!.query.columns).toBe(hidden);
  });

  it("loads Raw and views stored without columns with the default layout", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    storage.setItem("nest:task-table", JSON.stringify({ hidden: ["updated"] }));
    storage.setItem("nest:task-table-views", JSON.stringify({
      selectedId: "a",
      views: [
        { id: RAW_TASK_VIEW_ID, name: "Raw", query: { statuses: ["active"], columns: { hidden: ["parent"] } } },
        { id: "a", name: "Focus", query: { statuses: ["active"] } },
      ],
    }));
    const state = readSavedTaskViews(storage);
    expect(state.views.find(view => view.id === "a")!.query.columns).toEqual(DEFAULT_TASK_TABLE_QUERY.columns);
    expect(state.views.find(view => view.id === RAW_TASK_VIEW_ID)!.query).toEqual(DEFAULT_TASK_TABLE_QUERY);
  });

  it("round-trips through storage", () => {
    const values = new Map<string, string>();
    const storage = { getItem: (key: string) => values.get(key) ?? null, setItem: (key: string, value: string) => { values.set(key, value); } };
    const columns = splitTaskTableColumn(setTaskTableColumnHidden(DEFAULT_TASK_TABLE_QUERY.columns, "created", true), "title", 40);
    const views = viewsOf(createSavedTaskView(raw, query({ parent: "none", sort: [{ column: "updated", direction: "descending" }], columns }), "Loose", 2));
    writeSavedTaskViews({ views, selectedId: "view-2" }, storage);
    expect(readSavedTaskViews(storage)).toEqual({ views, selectedId: "view-2" });
  });
});


describe("ordered saved sorts", () => {
  it("loads legacy sorts and removes invalid or duplicate rules", () => {
    const stored = (sort: unknown) => normalizeSavedTaskViews({ views: [{ id: "a", name: "Focus", query: { sort } }] }).views.find(view => view.id === "a")!.query.sort;
    const primary = { column: "status", direction: "ascending" };
    const secondary = { column: "value", direction: "descending" };
    expect(stored(primary)).toEqual([primary]);
    expect(stored([primary, secondary, primary, { column: "invalid" }])).toEqual([primary, secondary]);
  });
  it("treats rule priority as part of the saved query", () => {
    const primary = { column: "status", direction: "ascending" } as const;
    const secondary = { column: "value", direction: "descending" } as const;
    expect(sameTaskTableQuery(query({ sort: [primary, secondary] }), query({ sort: [secondary, primary] }))).toBe(false);
  });
});

describe("Worked on and Status changed saved views", () => {
  it("keeps explicit ranges and presets, and defaults older views to unset", () => {
    const range = { kind: "range", fromDay: "2026-01-01", toDay: "2026-01-07" } as const;
    const preset = { kind: "preset", preset: "this_week" } as const;
    const state = normalizeSavedTaskViews({ views: [
      { id: "old", name: "Old", query: { statuses: ["active"] } },
      { id: "range", name: "Range", query: { workedOn: range, statusChanged: preset } },
    ] });
    expect(state.views[1]!.query.workedOn).toBeNull();
    expect(state.views[1]!.query.statusChanged).toBeNull();
    expect(state.views[2]!.query.workedOn).toEqual(range);
    expect(state.views[2]!.query.statusChanged).toEqual(preset);
  });

  it("marks each as a standalone query filter", () => {
    const saved = query({});
    for (const field of ["workedOn", "statusChanged"] as const) {
      const filtered = query({ [field]: { kind: "preset", preset: "today" } });
      expect(changedTaskTableQueryFields(saved, filtered)).toEqual(new Set([field]));
      expect(taskTableFiltersEdited(saved, filtered)).toBe(true);
      expect(taskTableColumnQueryEdited("updated", saved, filtered)).toBe(false);
      expect(sameTaskTableQuery(saved, filtered)).toBe(false);
    }
  });
});
