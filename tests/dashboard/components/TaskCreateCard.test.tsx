import type { ReactElement, ReactNode } from "react";
import { beforeEach, expect, it, vi } from "vitest";
import { EMPTY_TASK_DRAFT, TaskCreateCard } from "../../../src/dashboard/task/TaskCreateCard";
import type { Task } from "../../../src/lib/types";
import { buildTaskGraph } from "../../../src/dashboard/lib/taskGraph";

const mocks = vi.hoisted(() => ({ create: vi.fn(), parent: vi.fn(), reload: vi.fn(), error: vi.fn(), tasks: [] as Task[] }));
vi.mock("react", async (original) => ({ ...await original<typeof import("react")>(), useEffect: () => {}, useState: () => [false, vi.fn()] }));
vi.mock("react-dom", () => ({ createPortal: (node: ReactNode) => node }));
vi.mock("../../../src/lib/commands", () => ({ createTask: mocks.create, setTaskParent: mocks.parent, setTaskScore: vi.fn() }));
vi.mock("../../../src/dashboard/context/DashboardDataContext", () => ({
  useDashboardData: () => ({ tasks: mocks.tasks, taskGraph: buildTaskGraph(mocks.tasks), reload: mocks.reload, setError: mocks.error }),
}));

beforeEach(() => {
  vi.clearAllMocks();
  vi.stubGlobal("document", { querySelector: () => null, body: {} });
  mocks.tasks = [{ id: 1, title: "Existing", parentTaskId: null } as Task];
  mocks.create.mockResolvedValue({ id: 2 });
  mocks.parent.mockResolvedValue(undefined);
});

async function submit(parentTaskId: number | null, childTaskId: number | null) {
  const created = vi.fn();
  const overlay = TaskCreateCard({ draft: { ...EMPTY_TASK_DRAFT, title: "New", parentTaskId, childTaskId }, onDraftChange: vi.fn(), onClose: vi.fn(), onCreated: created }) as ReactElement<{ children: ReactElement<{ onSubmit: (event: { preventDefault: () => void }) => Promise<void> }> }>;
  await overlay.props.children.props.onSubmit({ preventDefault: vi.fn() });
  return created;
}

it("creates a child with the prefilled Parent", async () => {
  await submit(1, null);
  expect(mocks.create).toHaveBeenCalledWith("New", "", "backlog", 1);
  expect(mocks.parent).not.toHaveBeenCalled();
});

it("links the prefilled Child after creating its new Parent", async () => {
  const created = await submit(null, 1);
  expect(mocks.parent).toHaveBeenCalledWith(1, 2);
  expect(created).toHaveBeenCalledWith({ id: 2 });
});

it("reports a linking failure and reloads the created Task without retrying creation", async () => {
  mocks.parent.mockRejectedValue(new Error("Link failed"));
  const created = await submit(null, 1);
  expect(mocks.error).toHaveBeenCalledWith("Error: Link failed");
  expect(mocks.reload).toHaveBeenCalled();
  expect(created).toHaveBeenCalledWith({ id: 2 });
});
