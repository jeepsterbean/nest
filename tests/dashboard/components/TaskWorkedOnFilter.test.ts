import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskWorkedOnFilter } from "../../../src/dashboard/task/TaskWorkedOnFilter";
import { TASK_TABLE_COLUMNS } from "../../../src/dashboard/lib/taskTable";

const props = {
  onChange: () => {}, nowMs: new Date(2026, 9, 13).getTime(), edited: false,
  open: false, onOpenChange: () => {},
};

describe("Worked on toolbar control", () => {
  it("defaults to All dates as an independent control", () => {
    const html = renderToStaticMarkup(createElement(TaskWorkedOnFilter, { ...props, filter: null }));
    expect(html).toContain('aria-label="Worked on: All dates"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(TASK_TABLE_COLUMNS.map(c => c.id)).not.toContain("workedOn");
  });

  it("shows the selected period and marks changes to the saved view", () => {
    const html = renderToStaticMarkup(createElement(TaskWorkedOnFilter, {
      ...props, filter: { kind: "preset", preset: "this_week" }, edited: true,
    }));
    expect(html).toContain('aria-label="Worked on: This week"');
    expect(html).toContain("is-edited");
  });
});
