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

  it("leads each group line with its Task count", () => {
    expect(html).toMatch(/>7<\/span> Completed/);
    expect(html).toMatch(/>2<\/span> Cancelled/);
  });

  it("scales Task bars to the group's longest Task", () => {
    expect(html).toContain("--share:1");
    expect(html).toContain("--share:0.5");
  });

  it("says no time instead of a dash when a group has no Worked time", () => {
    expect(html).toContain("Cancelled, 2 Tasks, no time");
    expect(html).not.toContain("—");
  });

  it("lists every Task in the group for its scroll box", () => {
    expect(html).toContain("Task 7");
    expect(html).not.toMatch(/more</);
  });
});
