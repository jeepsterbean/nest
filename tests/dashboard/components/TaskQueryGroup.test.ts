import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { TaskQueryGroup } from "../../../src/dashboard/task/TaskQueryGroup";

const render = (props: { count?: number; isEmpty?: boolean }) =>
  renderToStaticMarkup(createElement(TaskQueryGroup, {
    label: "Filters", icon: null, title: "Filters", isEmpty: props.isEmpty ?? false, emptyHint: "Add a filter with +.",
    count: props.count, children: createElement("ul", null, createElement("li", null, "rule")),
  }));

// Opening, dismissal, and scroll-close need a DOM; this suite runs without one.
describe("Tasks query group", () => {
  it("renders a collapsed trigger that hides its rules until opened", () => {
    const html = render({ count: 2 });
    expect(html).toContain('aria-expanded="false"');
    expect(html).toContain('aria-haspopup="dialog"');
    expect(html).toContain("task-query__count");
    expect(html).not.toContain("rule");
    expect(html).not.toContain('role="dialog"');
  });

  it("omits the count badge when nothing is active", () => {
    expect(render({ count: 0 })).not.toContain("task-query__count");
    expect(render({})).not.toContain("task-query__count");
  });
});
