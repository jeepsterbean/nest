import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskFilterRules } from "../../../src/dashboard/task/TaskFilterRules";
import { DEFAULT_TASK_TABLE_QUERY, type TaskTableQuery } from "../../../src/dashboard/lib/taskTableViews";
import { buildScopeTree } from "../../../src/dashboard/lib/scope";

const render = (query: Partial<TaskTableQuery>, extra: { changedFields?: Set<string>; openField?: "value" | null } = {}) =>
  renderToStaticMarkup(createElement(TaskFilterRules, {
    query: { ...DEFAULT_TASK_TABLE_QUERY, ...query },
    onQueryChange: () => {},
    changedFields: extra.changedFields ?? new Set(),
    context: { tasks: [], scopeTree: buildScopeTree([]), workedTimeCandidates: [], workedSecondsByTask: null, workHistoryStatus: null },
    nowMs: new Date(2026, 9, 13, 12).getTime(),
    openField: extra.openField ?? null,
    onOpenFieldChange: () => {},
  }));

describe("Tasks query Filters", () => {
  it("always lists Worked on and Status changed as editable rows", () => {
    const html = render({});
    expect(html).toContain('aria-label="Worked on: -"');
    expect(html).toContain('aria-label="Status changed: -"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).not.toContain("Remove ");
    expect(html).not.toContain("Clear filters");
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
