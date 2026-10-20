import { renderToStaticMarkup } from "react-dom/server";
import { expect, it, vi } from "vitest";
import type { Task } from "../../../src/lib/types";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";
import { TaskRelations } from "../../../src/dashboard/task/TaskRelations";
import { RatingDotScale } from "../../../src/dashboard/task/RatingDotScale";
import { StatusTrigger } from "../../../src/dashboard/task/StatusTrigger";

const state = vi.hoisted(() => ({ tasks: [] as Task[] }));
vi.mock("../../../src/dashboard/context/DashboardDataContext", () => ({
  useDashboardData: () => ({ tasks: state.tasks, taskGraph: buildTaskGraph(state.tasks), mutate: vi.fn() }),
}));
vi.mock("../../../src/dashboard/context/TaskMenuContext", () => ({
  useTaskMenus: () => ({ statusMenu: null, openStatusMenu: vi.fn() }),
}));

const task = (id: number, status: Task["status"], parentTaskId: number | null = null): Task => ({
  id, title: `Task ${id}`, status, parentTaskId, description: "", workingNow: false,
  workedSeconds: 0, workStartedAt: null, value: null, effort: null, closedAt: null,
  followsTaskId: null, historyRevision: 0, createdAt: 1, updatedAt: 1,
});

it("shows open counts, navigable titles, status controls, and compact relationship menus", () => {
  const current = task(2, "active", 1);
  state.tasks = [task(1, "completed"), current, task(3, "backlog", 2), task(4, "cancelled", 2)];
  const html = renderToStaticMarkup(<TaskRelations task={current} onOpenTask={vi.fn()} onCreateRelated={vi.fn()} />);
  expect(html).toContain("0/1 open");
  expect(html).toContain("1/2 open");
  expect(html).toContain('class="task-relation-open"');
  expect(html).toContain('aria-label="Status for Task 3: Backlog"');
  expect(html).toContain('aria-label="Unlink parent Task 1"');
  expect(html).toContain('aria-label="Link child to Task 2"');
  expect(html).not.toContain("menu-select__chevron");
});

it("gives each rating dot an explicit numeric accessible name", () => {
  const html = renderToStaticMarkup(<RatingDotScale kind="value" label="Value" ariaLabel="Value" current={3} onChange={vi.fn()} />);
  for (let n = 1; n <= 5; n++) expect(html).toContain(`aria-label="${n} out of 5"`);
  expect(html.match(/aria-checked="true"/g)).toHaveLength(1);
});

it("allows Table statuses to keep their accessible name while hiding the icon", () => {
  const html = renderToStaticMarkup(<StatusTrigger task={task(1, "active")} showIcon={false} />);
  expect(html).toContain('aria-label="Status for Task 1: Active"');
  expect(html).not.toContain("task-status-icon");
});
