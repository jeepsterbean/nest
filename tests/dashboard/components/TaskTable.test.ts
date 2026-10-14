import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { Task } from "../../../src/lib/types";
import { TaskTable } from "../../../src/dashboard/task/TaskTable";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import { TASK_TABLE_COLUMNS } from "../../../src/dashboard/lib/taskTable";

const task: Task = {
  id: 1, title: "Bookshelf", description: "", status: "active", workingNow: true,
  workedSeconds: 36_000, workStartedAt: 0, scope: null, value: null, effort: null,
  parentTaskId: null, createdAt: 0, updatedAt: 0, closedAt: null, followsTaskId: null, historyRevision: 0,
};
const props = {
  tasks: [task], taskGraph: buildTaskGraph([task], []), emptyCopy: "No tasks",
  columns: TASK_TABLE_COLUMNS.filter(c => c.id === "title" || c.id === "workedTime"),
  nowMs: 60_000,
};

describe("Tasks table Worked time", () => {
  it("displays only range time while preserving the Working now indicator", () => {
    const html = renderToStaticMarkup(createElement(TaskTable, {
      ...props, workedSecondsByTask: new Map([[1, 1_200]]),
    }));
    expect(html).toContain('dateTime="PT1200S"');
    expect(html).toContain("20m 0s Worked time in range");
    expect(html).toContain('aria-label="Working now"');
    expect(html).not.toContain("10h");
    expect(task.workedSeconds).toBe(36_000);
  });

  it("restores all-time totals, including live work, when the range is cleared", () => {
    const html = renderToStaticMarkup(createElement(TaskTable, props));
    expect(html).toContain('dateTime="PT36060S"');
    expect(html).toContain("10h 1m 0s Worked time, all time");
  });
});
