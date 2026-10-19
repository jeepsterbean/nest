import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { describe, expect, it } from "vitest";
import type { TaskEditEvent, TaskUpdateKind } from "../../../src/lib/types";
import { TaskEditLogDetail } from "../../../src/dashboard/components/logs/TaskEditLogDetail";
import { logEventLabel } from "../../../src/dashboard/components/logs/LogEventMark";
import { TASK_UPDATE_LABEL, taskUpdateDetail } from "../../../src/dashboard/lib/taskUpdates";
import { buildLogsEvents } from "../../../src/dashboard/lib/logs";

function edit(kind: TaskUpdateKind, id = 1): TaskEditEvent {
  return { taskId: 7, update: { kind, cursor: { time: 100, source: 0, id },
    beforeValue: null, afterValue: null, workBefore: null, workAfter: null,
    relatedTaskId: null, relatedTitle: null } };
}

describe("Timeline Task edits", () => {
  it("merges edits with lifecycle events once, keeps stable ties, and respects Tasks visibility", () => {
    const edits = [edit("title", 1), edit("description", 2)];
    const status = [{ id: 1, taskId: 7, fromStatus: null, toStatus: "active" as const, createdAt: 90 }];
    const stretches = [{ id: 1, taskId: 7, startedAt: 80, endedAt: 110 }];
    const events = buildLogsEvents(["tasks"], false, [], [], [], stretches, 0, status, edits);
    expect(events.map(event => event.kind)).toEqual(["work-stop", "task-edit", "task-edit", "task-status", "work-start"]);
    expect(events.filter(event => event.kind === "task-edit").map(event => event.editEvent.update.cursor.id)).toEqual([2, 1]);
    expect(buildLogsEvents(["notes"], false, [], [], [], stretches, 0, status, edits)).toEqual([]);
    expect(buildLogsEvents(["tasks"], false, [], [], [], [], 0, [], [])).toEqual([]);
  });

  it("renders rename details and includes them in the accessible event label", () => {
    const event = edit("title");
    event.update.beforeValue = "Old title";
    event.update.afterValue = "New title";
    const markup = renderToStaticMarkup(createElement(TaskEditLogDetail, { event, tasks: [] }));
    expect(markup).toContain("Renamed");
    expect(markup).toContain("Old title → New title");
    expect(logEventLabel({ kind: "task-edit", at: 100, editEvent: event }, [], [], []))
      .toBe("Task 7 — Renamed · Old title → New title");
  });

  it("formats scores, description edits, and related title snapshots", () => {
    const score = edit("value");
    score.update.afterValue = "4";
    expect(taskUpdateDetail(score.update)).toBe("None → 4");
    expect(taskUpdateDetail(edit("description").update)).toBeNull();
    const relationshipKinds: TaskUpdateKind[] = ["parent_set", "parent_removed", "child_added", "child_removed",
      "follows", "follow_up", "follows_removed", "follow_up_removed"];
    for (const kind of relationshipKinds) {
      const event = edit(kind);
      event.update.relatedTaskId = 12;
      event.update.relatedTitle = "Saved related title";
      expect(taskUpdateDetail(event.update)).toBe("Saved related title");
      expect(renderToStaticMarkup(createElement(TaskEditLogDetail, { event, tasks: [] }))).toContain(TASK_UPDATE_LABEL[kind]);
    }
  });

  it("shows both work correction intervals and retains removed work details", () => {
    const event = edit("work_corrected");
    event.update.workBefore = { startedAt: 100, endedAt: null };
    event.update.workAfter = { startedAt: 200, endedAt: 300 };
    const detail = taskUpdateDetail(event.update);
    expect(detail).toContain("still running");
    expect(detail).toContain(" → ");
    event.update.kind = "work_removed";
    event.update.workAfter = null;
    expect(taskUpdateDetail(event.update)).toContain("still running");
    expect(taskUpdateDetail(event.update)).not.toContain(" → ");
  });
});
