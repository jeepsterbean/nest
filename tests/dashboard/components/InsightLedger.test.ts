import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { InsightLedger } from "../../../src/dashboard/components/InsightBoard";
import type { InsightOutcomeGroup } from "../../../src/dashboard/lib/insights";
import type { Task } from "../../../src/lib/types";

const task = (id: number): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status: "completed",
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope: null,
  value: null,
  effort: null,
  parentTaskId: null,
  createdAt: 0,
  updatedAt: 0,
});

const rows = (count: number, seconds: (index: number) => number) =>
  Array.from({ length: count }, (_, index) => ({
    task: task(index + 1),
    seconds: seconds(index),
  }));

describe("InsightLedger", () => {
  const completed = rows(7, (index) => 3600 - index * 300);
  const groups: InsightOutcomeGroup[] = [
    {
      outcome: "completed",
      rows: completed,
      seconds: completed.reduce((sum, row) => sum + row.seconds, 0),
    },
    { outcome: "cancelled", rows: rows(2, () => 0), seconds: 0 },
    { outcome: "incomplete", rows: [], seconds: 0 },
  ];
  const html = renderToStaticMarkup(createElement(InsightLedger, { groups }));

  it("shows each outcome title followed by its count", () => {
    expect(html).toMatch(/>Completed<\/span><span class="insight-row__count">7<\/span>/);
    expect(html).toMatch(/>Cancelled<\/span><span class="insight-row__count">2<\/span>/);
    expect(html).toMatch(/>Incomplete<\/span><span class="insight-row__count">0<\/span>/);
    expect(html).not.toContain("no time");
  });

  it("keeps outcome rows as summaries without clickable titles or expansion", () => {
    expect(html).not.toContain("<button");
    expect(html).not.toContain("aria-expanded");
    expect(html).not.toContain("chevron");
    expect(html).not.toContain("Task 7");
    expect(html).not.toContain("<ul");
  });
});
