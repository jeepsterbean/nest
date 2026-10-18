import { describe, expect, it } from "vitest";
import {
  fitTaskTableColumns,
  moveTaskTableColumn,
  normalizeTaskTableLayout,
  sameTaskTableLayout,
  serializeTaskTableLayout,
  setTaskTableColumnHidden,
  showAllTaskTableColumns,
  splitTaskTableColumn,
  TASK_TABLE_COLUMNS,
  visibleTaskViewFor,
  type TaskTableColumn,
} from "../../../src/dashboard/lib/taskTable";

const defaultIds = TASK_TABLE_COLUMNS.map((column) => column.id);

describe("task view", () => {
  it("shows Table for a Map choice while Map is hidden", () => {
    expect(visibleTaskViewFor("map", false)).toBe("table");
    expect(visibleTaskViewFor("map", true)).toBe("map");
    expect(visibleTaskViewFor("table", false)).toBe("table");
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

  it("keeps a stored width above the old 640 cap so it can work as a fill weight", () => {
    const layout = normalizeTaskTableLayout({ widths: { title: 900 } });
    expect(layout[0]?.width).toBe(900);
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

  it("clamps a stored width up to the column's min", () => {
    const layout = normalizeTaskTableLayout({ widths: { title: 10 } });
    expect(layout[0]?.width).toBe(120);
  });

  it("moves a column onto the target's slot", () => {
    const columns = normalizeTaskTableLayout(null);
    expect(
      moveTaskTableColumn(columns, "title", "status").map((column) => column.id),
    ).toEqual([
      "status",
      "title",
      "value",
      "effort",
      "workedTime",
      "created",
      "updated",
      "closed",
    ]);
  });

  it("round-trips order and widths through the stored shape", () => {
    const moved = moveTaskTableColumn(
      splitTaskTableColumn(normalizeTaskTableLayout(null), "title", 20),
      "updated",
      "title",
    );
    expect(normalizeTaskTableLayout(serializeTaskTableLayout(moved))).toEqual(moved);
  });

  it("hides columns, keeps Title visible, and round-trips hidden ids", () => {
    let columns = normalizeTaskTableLayout(null);
    columns = setTaskTableColumnHidden(columns, "created", true);
    columns = setTaskTableColumnHidden(columns, "title", true);
    expect(columns.filter((column) => column.hidden).map((column) => column.id)).toEqual(["created"]);
    expect(normalizeTaskTableLayout(serializeTaskTableLayout(columns))).toEqual(columns);
    expect(showAllTaskTableColumns(columns).some((column) => column.hidden)).toBe(false);
  });

  it("ignores a stored hidden Title and unknown hidden ids", () => {
    const layout = normalizeTaskTableLayout({ hidden: ["title", "bogus", "updated"] });
    expect(layout.filter((column) => column.hidden).map((column) => column.id)).toEqual(["updated"]);
  });

  it("compares layouts by order, width, and hidden", () => {
    const columns = normalizeTaskTableLayout(null);
    expect(sameTaskTableLayout(columns, normalizeTaskTableLayout(null))).toBe(true);
    expect(sameTaskTableLayout(columns, moveTaskTableColumn(columns, "updated", "title"))).toBe(false);
    expect(sameTaskTableLayout(columns, splitTaskTableColumn(columns, "title", 20))).toBe(false);
    const hidden = setTaskTableColumnHidden(columns, "created", true);
    expect(sameTaskTableLayout(columns, hidden)).toBe(false);
  });
});

const visibleSum = (columns: TaskTableColumn[]) =>
  columns.filter((column) => !column.hidden).reduce((sum, column) => sum + column.width, 0);

describe("task table fill", () => {
  it("scales visible columns so they fill the available width", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 200, minWidth: 120 },
      { id: "updated", label: "Updated", width: 100, minWidth: 88 },
    ];
    const fitted = fitTaskTableColumns(columns, 600);
    expect(fitted.map((column) => column.width)).toEqual([400, 200]);
    expect(visibleSum(fitted)).toBe(600);
  });

  it("leaves hidden column widths alone so they can return at the same weight", () => {
    const columns = setTaskTableColumnHidden(normalizeTaskTableLayout(null), "created", true);
    const created = columns.find((column) => column.id === "created")!.width;
    const fitted = fitTaskTableColumns(columns, 1000);
    expect(fitted.find((column) => column.id === "created")?.width).toBe(created);
    expect(visibleSum(fitted)).toBe(1000);
  });

  it("gives every visible column its min when the pane is narrower than the mins", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 200, minWidth: 120 },
      { id: "updated", label: "Updated", width: 100, minWidth: 88 },
    ];
    const fitted = fitTaskTableColumns(columns, 150);
    expect(fitted.map((column) => column.width)).toEqual([120, 88]);
  });

  it("locks a column at min and gives the rest of the slack to its neighbors", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 200, minWidth: 120 },
      { id: "updated", label: "Updated", width: 100, minWidth: 88 },
    ];
    const fitted = fitTaskTableColumns(columns, 220);
    expect(fitted[1]?.width).toBe(88);
    expect(fitted[0]?.width).toBe(132);
  });

  it("returns the same array when visible widths already fill the pane", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 400, minWidth: 120 },
      { id: "updated", label: "Updated", width: 200, minWidth: 88 },
    ];
    expect(fitTaskTableColumns(columns, 600)).toBe(columns);
  });
});

describe("task table neighbor split", () => {
  it("grows a column and shrinks the next visible neighbor by the same amount", () => {
    const columns = normalizeTaskTableLayout(null);
    const split = splitTaskTableColumn(columns, "title", 20);
    expect(split[0]?.width).toBe(columns[0]!.width + 20);
    expect(split[1]?.width).toBe(columns[1]!.width - 20);
    expect(visibleSum(split)).toBe(visibleSum(columns));
  });

  it("skips a hidden neighbor and trades with the next visible column", () => {
    const columns = setTaskTableColumnHidden(normalizeTaskTableLayout(null), "updated", true);
    const split = splitTaskTableColumn(columns, "title", 16);
    expect(split.find((column) => column.id === "title")?.width).toBe(256);
    expect(split.find((column) => column.id === "updated")?.width).toBe(100);
    expect(split.find((column) => column.id === "status")?.width).toBe(112);
  });

  it("stops when the neighbor is at its min", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 200, minWidth: 120 },
      { id: "updated", label: "Updated", width: 88, minWidth: 88 },
    ];
    expect(splitTaskTableColumn(columns, "title", 40)).toBe(columns);
  });

  it("stops when the resized column is at its min", () => {
    const columns: TaskTableColumn[] = [
      { id: "title", label: "Title", width: 120, minWidth: 120 },
      { id: "updated", label: "Updated", width: 140, minWidth: 88 },
    ];
    expect(splitTaskTableColumn(columns, "title", -40)).toBe(columns);
  });

  it("does nothing on the last visible column", () => {
    const columns = normalizeTaskTableLayout(null);
    expect(splitTaskTableColumn(columns, "closed", 20)).toBe(columns);
  });
});
