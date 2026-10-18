import { describe, expect, it } from "vitest";
import type { Task } from "../../src/lib/types";
import {
  appendTaskOnce,
  placeChildAfterParent,
  replaceTask,
} from "../../src/popup/taskReconciliation";

const task = (id: number, title = `Task ${id}`): Task => ({
  id,
  title,
  description: "",
  status: "active",
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,

  value: null,
  effort: null,
  parentTaskIds: [],
  createdAt: 1,
  updatedAt: 1,
  closedAt: null,
  followsTaskId: null, historyRevision: 0,
});

describe("popup task reconciliation", () => {
  it("applies a command result without dropping tasks from a newer reload", () => {
    const updated = { ...task(1), workingNow: true };
    const fromAnotherWindow = task(2);

    expect(replaceTask([task(1), fromAnotherWindow], updated)).toEqual([
      updated,
      fromAnotherWindow,
    ]);
  });

  it("adds a created task once in either event order", () => {
    const created = task(2);
    const original = [task(1)];

    expect(appendTaskOnce(original, created)).toEqual([original[0], created]);
    expect(appendTaskOnce([...original, created], created)).toEqual([
      original[0],
      created,
    ]);
  });

  it("places a child below its parent once while preserving refreshed tasks", () => {
    const parent = task(1);
    const child = { ...task(3), parentTaskIds: [parent.id] };
    const refreshedChild = { ...child, title: "Renamed child" };
    const fromAnotherWindow = task(4);

    expect(
      placeChildAfterParent([parent, fromAnotherWindow], parent.id, child),
    ).toEqual([parent, child, fromAnotherWindow]);
    expect(
      placeChildAfterParent(
        [parent, fromAnotherWindow, refreshedChild],
        parent.id,
        child,
      ),
    ).toEqual([parent, refreshedChild, fromAnotherWindow]);
  });
});
