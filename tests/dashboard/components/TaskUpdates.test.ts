import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { Task, TaskUpdatePage } from "../../../src/lib/types";
import { TaskUpdates } from "../../../src/dashboard/task/TaskUpdates";

const hooks = vi.hoisted(() => ({
  effects: [] as (() => void | (() => void))[],
  setters: [] as ReturnType<typeof vi.fn>[],
  list: vi.fn(),
}));

vi.mock("../../../src/lib/commands", () => ({ listTaskUpdates: hooks.list }));
vi.mock("react", async (importOriginal) => ({
  ...await importOriginal<typeof import("react")>(),
  useEffect: (effect: () => void | (() => void)) => hooks.effects.push(effect),
  useLayoutEffect: () => {},
  useState: (initial: unknown) => {
    const setter = vi.fn();
    hooks.setters.push(setter);
    return [initial, setter];
  },
}));

const task: Task = {
  id: 1, title: "Bookshelf", description: "", status: "active", workingNow: false,
  workedSeconds: 0, workStartedAt: null, scope: null, value: null, effort: null,
  parentTaskId: null, createdAt: 1, updatedAt: 10, closedAt: null,
  followsTaskId: null, historyRevision: 2,
};
const newest: TaskUpdatePage = {
  updates: [], hasMore: true, recordingStartedAt: 10,
};

beforeEach(() => {
  hooks.effects.length = 0;
  hooks.setters.length = 0;
  hooks.list.mockReset();
});

describe("Task History refresh", () => {
  it("clears cached pages and replaces them with a fresh pagination boundary", async () => {
    hooks.list.mockResolvedValue(newest);
    renderToStaticMarkup(createElement(TaskUpdates, { task }));
    hooks.effects[0]();
    const setPage = hooks.setters[0];
    expect(setPage).toHaveBeenNthCalledWith(1, null);
    await vi.waitFor(() => expect(setPage).toHaveBeenNthCalledWith(2, newest));
    // Replacing the page discards removed work boundaries and resumes loading
    // at the server's newest cursor instead of jumping over unseen entries.
    expect(hooks.list).toHaveBeenCalledWith(task.id);
    expect(setPage).toHaveBeenCalledTimes(2);
  });

  it("discards a response after its revision has been superseded", async () => {
    let resolve: (page: TaskUpdatePage) => void = () => {};
    hooks.list.mockReturnValue(new Promise<TaskUpdatePage>((done) => { resolve = done; }));
    renderToStaticMarkup(createElement(TaskUpdates, { task }));
    const cleanup = hooks.effects[0]();
    if (typeof cleanup === "function") cleanup();
    resolve(newest);
    await Promise.resolve();
    expect(hooks.setters[0]).toHaveBeenCalledTimes(1);
    expect(hooks.setters[0]).toHaveBeenCalledWith(null);
  });
});
