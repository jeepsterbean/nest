import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskFilterRules } from "../../../src/dashboard/task/TaskFilterRules";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableQuery } from "../../../src/dashboard/lib/taskTableViews";

const render = (query: Partial<TaskTableQuery>, extra: { changedFields?: Set<string>; openField?: "value" | null } = {}) =>
  renderToStaticMarkup(createElement(TaskFilterRules, {
    query: { ...DEFAULT_TASK_TABLE_QUERY, ...query },
    onQueryChange: () => {},
    changedFields: extra.changedFields ?? new Set(),
    context: { tasks: [], workedTimeCandidates: [], workedSecondsByTask: null, workHistoryStatus: null },
    nowMs: new Date(2026, 9, 13, 12).getTime(),
    openField: extra.openField ?? null,
    onOpenFieldChange: () => {},
  }));

describe("Tasks query Filters", () => {
  it("lists only active filters and offers the rest through the add menu", () => {
    const html = render({});
    expect(html).not.toContain("Worked on");
    expect(html).not.toContain("Status changed");
    expect(html).not.toContain("Remove ");
    expect(html).not.toContain("Clear filters");
    expect(html).toContain('aria-label="Add filter"');
    expect(html).not.toMatch(/aria-label="Add filter"[^>]*disabled/);
  });

  it("disables the add menu once every filter has a row", () => {
    const today = { kind: "preset", preset: "today" } as const;
    const html = render({
      statuses: ["active"], parent: "none", created: today, updated: today, closed: today,
      workedOn: today, statusChanged: today,
      value: { kind: "scores", scores: [4] }, effort: { kind: "scores", scores: [4] },
      workedTime: { comparator: "more", seconds: 60 },
    });
    expect(html).toMatch(/aria-label="Add filter"[^>]*disabled/);
  });

  it("lists active column filters as editable rows and offers Clear with two or more", () => {
    const html = render({
      statusChanged: { kind: "preset", preset: "today" },
      value: { kind: "scores", scores: [4] },
    }, { changedFields: new Set(["statusChanged"]) });
    expect(html).toContain('aria-label="Status changed: Today"');
    expect(html).toContain('aria-label="Remove Status changed: Today"');
    expect(html).toContain('aria-label="Value: 4"');
    expect(html).toContain("Clear filters");
    expect(html).toContain("is-edited");
  });

  it("keeps a cleared column filter's row while its menu is open", () => {
    expect(render({})).not.toContain('aria-label="Value: All"');
    expect(render({}, { openField: "value" })).toContain('aria-label="Value: All"');
  });
});
