import { describe, expect, it } from "vitest";
import {
  moveTaskTableColumn,
  normalizeTaskTableLayout,
  overviewTaskColumns,
  readTaskTableLayout,
  readTaskView,
  resizeTaskTableColumn,
  TASK_TABLE_COLUMNS,
  writeTaskTableLayout,
  writeTaskView,
} from "../../../src/dashboard/lib/taskTable";

const memory = () => {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    setItem: (key: string, value: string) => {
      values.set(key, value);
    },
  };
};

const defaultIds = TASK_TABLE_COLUMNS.map((column) => column.id);

describe("task view", () => {
  it("defaults to Table and restores the last saved layout", () => {
    const storage = memory();
    expect(readTaskView(storage)).toBe("table");
    writeTaskView("kanban", storage);
    expect(readTaskView(storage)).toBe("kanban");
  });

  it("falls back to Table for an unknown stored view", () => {
    const storage = memory();
    storage.setItem("nest:task-view", "graph");
    expect(readTaskView(storage)).toBe("table");
  });
});

describe("task table layout", () => {
  it("starts from the default columns", () => {
    expect(normalizeTaskTableLayout(null).map((column) => column.id)).toEqual(defaultIds);
  });

  it("keeps a remembered order, drops unknown ids, and appends new columns", () => {
    const layout = normalizeTaskTableLayout({
      order: ["status", "bogus", "title", "title"],
      widths: { title: 180, status: 90 },
    });
    expect(layout.map((column) => column.id)).toEqual([
      "status",
      "title",
      ...defaultIds.filter((id) => id !== "status" && id !== "title"),
    ]);
    expect(layout[0]?.width).toBe(96);
    expect(layout[1]?.width).toBe(180);
  });

  it("replaces a remembered Priority column with Value and Effort", () => {
    const layout = normalizeTaskTableLayout({
      order: ["title", "priority", "status"],
    });
    expect(layout.map((column) => column.id).slice(0, 4)).toEqual([
      "title",
      "value",
      "effort",
      "status",
    ]);
  });

  it("clamps a resize to the column's min and max", () => {
    const columns = normalizeTaskTableLayout(null);
    expect(resizeTaskTableColumn(columns, "title", 10)[0]?.width).toBe(120);
    expect(resizeTaskTableColumn(columns, "title", 900)[0]?.width).toBe(640);
  });

  it("moves a column onto the target's slot", () => {
    const columns = normalizeTaskTableLayout(null);
    expect(
      moveTaskTableColumn(columns, "title", "status").map((column) => column.id),
    ).toEqual([
      "scope",
      "parent",
      "status",
      "title",
      "value",
      "effort",
      "workedTime",
      "created",
      "updated",
    ]);
  });

  it("round-trips order and widths through storage", () => {
    const storage = memory();
    const moved = moveTaskTableColumn(
      resizeTaskTableColumn(normalizeTaskTableLayout(null), "scope", 160),
      "updated",
      "title",
    );
    writeTaskTableLayout(moved, storage);
    expect(readTaskTableLayout(storage)).toEqual(moved);
  });

  it("recovers from broken stored JSON", () => {
    const storage = memory();
    storage.setItem("nest:task-table", "{");
    expect(readTaskTableLayout(storage).map((column) => column.id)).toEqual(defaultIds);
  });

  it("builds Overview columns in status · title · value · effort order", () => {
    expect(overviewTaskColumns().map((column) => column.id)).toEqual([
      "status",
      "title",
      "value",
      "effort",
    ]);
  });
});
