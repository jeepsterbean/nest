import { describe, expect, it } from "vitest";
import {
  measureTaskLayout, removeTaskPane, resizeTaskSplit, splitTaskPane, taskLayoutMinimum,
  taskPaneDropAt, taskPaneIds, TASK_PANE_DIVIDER, TASK_PANE_LIMIT, TASK_PANE_MIN_HEIGHT, TASK_PANE_MIN_WIDTH, type TaskPaneLayout,
} from "../../../src/dashboard/lib/taskPaneLayout";
import { normalizeTaskPaneWorkspace } from "../../../src/dashboard/lib/taskPaneWorkspace";
import { normalizeSavedTaskViews } from "../../../src/dashboard/lib/taskTableViews";

const single: TaskPaneLayout = { kind: "pane", id: "a" };
const beside = splitTaskPane(single, "a", "b", "right", "ab");
const mixed = splitTaskPane(beside, "b", "c", "bottom", "bc");

describe("task pane layout", () => {
  it("splits only the targeted pane in each direction", () => {
    expect(taskPaneIds(splitTaskPane(single, "a", "b", "left", "s"))).toEqual(["b", "a"]);
    expect(taskPaneIds(mixed)).toEqual(["a", "b", "c"]);
    expect(mixed.kind === "split" && mixed.first).toEqual(single);
    expect(splitTaskPane(single, "missing", "b", "right", "s")).toEqual(single);
    const above = splitTaskPane(single, "a", "b", "top", "s");
    expect(above.kind === "split" && above.axis).toBe("vertical");
    expect(taskPaneIds(above)).toEqual(["b", "a"]);
  });

  it("collapses the removed pane's split and preserves the remaining subtree", () => {
    expect(removeTaskPane(mixed, "a")).toEqual(mixed.kind === "split" ? mixed.second : null);
    expect(removeTaskPane(mixed, "c")).toEqual(beside);
    expect(removeTaskPane(single, "a")).toBeNull();
    expect(removeTaskPane(mixed, "missing")).toEqual(mixed);
  });

  it("fills both dimensions exactly with nested splits and dividers", () => {
    const result = measureTaskLayout(mixed, { left: 0, top: 0, width: 1000, height: 600 });
    const a = result.panes.get("a")!;
    const b = result.panes.get("b")!;
    const c = result.panes.get("c")!;
    expect(a.height).toBe(600);
    expect(a.width + TASK_PANE_DIVIDER).toBe(b.left);
    expect(b.left + b.width).toBe(1000);
    expect(b.top + b.height + TASK_PANE_DIVIDER).toBe(c.top);
    expect(c.top + c.height).toBe(600);
    expect(c.left + c.width).toBe(1000);
    expect(result.dividers).toHaveLength(2);
  });

  it("protects every descendant's minimum size when resizing a containing split", () => {
    const nested = splitTaskPane(beside, "b", "c", "right", "bc");
    const minimum = taskLayoutMinimum(nested);
    expect(minimum.width).toBe(3 * TASK_PANE_MIN_WIDTH + 2 * TASK_PANE_DIVIDER);
    const layout = resizeTaskSplit(nested, "ab", 0.95);
    const result = measureTaskLayout(layout, { left: 0, top: 0, width: minimum.width, height: 400 });
    for (const rect of result.panes.values()) expect(rect.width).toBeCloseTo(TASK_PANE_MIN_WIDTH);
    expect(taskLayoutMinimum(mixed).height).toBe(2 * TASK_PANE_MIN_HEIGHT + TASK_PANE_DIVIDER);
  });

  it("resizes the requested nested divider independently", () => {
    const resized = resizeTaskSplit(mixed, "bc", 0.7);
    expect(resized.kind === "split" && resized.ratio).toBe(0.5);
    expect(resized.kind === "split" && resized.second.kind === "split" && resized.second.ratio).toBe(0.7);
  });

  it("selects edges by relative distance and reserves the center for replacement", () => {
    expect(taskPaneDropAt(5, 150, 800, 300)).toBe("left");
    expect(taskPaneDropAt(795, 150, 800, 300)).toBe("right");
    expect(taskPaneDropAt(400, 5, 800, 300)).toBe("top");
    expect(taskPaneDropAt(400, 295, 800, 300)).toBe("bottom");
    expect(taskPaneDropAt(400, 150, 800, 300)).toBe("center");
  });
});

describe("task pane workspace restoration", () => {
  const saved = normalizeSavedTaskViews(null);
  const pane = (id: string) => ({ id, viewId: saved.selectedId });
  it("restores mixed layouts and active panes while discarding unrelated records", () => {
    const restored = normalizeTaskPaneWorkspace({ layout: mixed, panes: [pane("a"), pane("b"), pane("c"), pane("unused")], activeId: "b" }, saved);
    expect(restored.layout).toEqual(mixed);
    expect(restored.panes.map(item => item.id)).toEqual(["a", "b", "c"]);
    expect(restored.activeId).toBe("b");
  });
  it("replaces removed saved views with Raw and recovers a missing active pane", () => {
    const restored = normalizeTaskPaneWorkspace({ layout: beside, panes: [{ id: "a", viewId: "deleted" }], activeId: "missing" }, saved);
    expect(restored.panes).toEqual([pane("a"), pane("b")]);
    expect(restored.activeId).toBe("a");
  });
  it("restores a layout at the pane limit and recovers one past it", () => {
    const chain = (count: number) => Array.from({ length: count - 1 }, (_, index) => index + 1).reduce<TaskPaneLayout>(
      (layout, index) => splitTaskPane(layout, `p${index - 1}`, `p${index}`, "right", `s${index}`), { kind: "pane", id: "p0" });
    const stored = (count: number) => ({ layout: chain(count), panes: taskPaneIds(chain(count)).map(pane) });
    expect(normalizeTaskPaneWorkspace(stored(TASK_PANE_LIMIT), saved).panes).toHaveLength(TASK_PANE_LIMIT);
    expect(normalizeTaskPaneWorkspace(stored(TASK_PANE_LIMIT + 1), saved).panes).toHaveLength(1);
  });
  it.each([null, {}, { layout: { ...beside, ratio: Number.NaN }, panes: [] },
    { layout: { ...beside, second: single }, panes: [] },
    { layout: { ...beside, axis: "diagonal" }, panes: [] }])("recovers invalid stored layouts", stored => {
    expect(normalizeTaskPaneWorkspace(stored, saved).panes).toHaveLength(1);
  });
});
