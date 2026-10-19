export type TaskPaneEdge = "left" | "right" | "top" | "bottom";
export type TaskPaneDrop = TaskPaneEdge | "center";
export type TaskPaneLayout =
  | { kind: "pane"; id: string }
  | { kind: "split"; id: string; axis: "horizontal" | "vertical"; ratio: number; first: TaskPaneLayout; second: TaskPaneLayout };
export type TaskPaneRect = { left: number; top: number; width: number; height: number };
export const TASK_PANE_MIN_WIDTH = 280;
export const TASK_PANE_MIN_HEIGHT = 180;
export const TASK_PANE_DIVIDER = 6;
// Panes shrink to TASK_PANE_MIN_WIDTH, so more than this never stays readable. The
// stored-layout parser shares the cap so a saved arrangement always reloads intact.
export const TASK_PANE_LIMIT = 16;

export function taskPaneIds(layout: TaskPaneLayout): string[] {
  return layout.kind === "pane" ? [layout.id] : [...taskPaneIds(layout.first), ...taskPaneIds(layout.second)];
}

export function removeTaskPane(layout: TaskPaneLayout, id: string): TaskPaneLayout | null {
  if (layout.kind === "pane") return layout.id === id ? null : layout;
  const first = removeTaskPane(layout.first, id);
  const second = removeTaskPane(layout.second, id);
  return first && second ? { ...layout, first, second } : first ?? second;
}

export function splitTaskPane(layout: TaskPaneLayout, targetId: string, paneId: string, edge: TaskPaneEdge, splitId: string): TaskPaneLayout {
  if (layout.kind === "pane") {
    if (layout.id !== targetId) return layout;
    const added: TaskPaneLayout = { kind: "pane", id: paneId };
    const before = edge === "left" || edge === "top";
    return { kind: "split", id: splitId, axis: edge === "left" || edge === "right" ? "horizontal" : "vertical", ratio: 0.5,
      first: before ? added : layout, second: before ? layout : added };
  }
  return { ...layout, first: splitTaskPane(layout.first, targetId, paneId, edge, splitId), second: splitTaskPane(layout.second, targetId, paneId, edge, splitId) };
}

export function resizeTaskSplit(layout: TaskPaneLayout, id: string, ratio: number): TaskPaneLayout {
  if (layout.kind === "pane") return layout;
  if (layout.id === id) return { ...layout, ratio: Math.max(0.05, Math.min(0.95, ratio)) };
  return { ...layout, first: resizeTaskSplit(layout.first, id, ratio), second: resizeTaskSplit(layout.second, id, ratio) };
}

export function taskLayoutMinimum(layout: TaskPaneLayout): { width: number; height: number } {
  if (layout.kind === "pane") return { width: TASK_PANE_MIN_WIDTH, height: TASK_PANE_MIN_HEIGHT };
  const first = taskLayoutMinimum(layout.first);
  const second = taskLayoutMinimum(layout.second);
  return layout.axis === "horizontal"
    ? { width: first.width + second.width + TASK_PANE_DIVIDER, height: Math.max(first.height, second.height) }
    : { width: Math.max(first.width, second.width), height: first.height + second.height + TASK_PANE_DIVIDER };
}

export function measureTaskLayout(layout: TaskPaneLayout, rect: TaskPaneRect) {
  const panes = new Map<string, TaskPaneRect>();
  const dividers: { id: string; axis: "horizontal" | "vertical"; rect: TaskPaneRect; parent: TaskPaneRect; ratio: number; minRatio: number; maxRatio: number }[] = [];
  const visit = (node: TaskPaneLayout, box: TaskPaneRect) => {
    if (node.kind === "pane") { panes.set(node.id, box); return; }
    const horizontal = node.axis === "horizontal";
    const dimension = horizontal ? "width" : "height";
    const available = box[dimension] - TASK_PANE_DIVIDER;
    const minRatio = taskLayoutMinimum(node.first)[dimension] / available;
    const maxRatio = 1 - taskLayoutMinimum(node.second)[dimension] / available;
    const ratio = Math.max(minRatio, Math.min(maxRatio, node.ratio));
    const firstSize = available * ratio;
    const secondStart = firstSize + TASK_PANE_DIVIDER;
    const first = { ...box, [dimension]: firstSize };
    const second = { ...box, [horizontal ? "left" : "top"]: box[horizontal ? "left" : "top"] + secondStart, [dimension]: available - firstSize };
    const divider = { ...box, [horizontal ? "left" : "top"]: box[horizontal ? "left" : "top"] + firstSize, [dimension]: TASK_PANE_DIVIDER };
    dividers.push({ id: node.id, axis: node.axis, rect: divider, parent: box, ratio, minRatio, maxRatio });
    visit(node.first, first);
    visit(node.second, second);
  };
  visit(layout, rect);
  return { panes, dividers };
}

export function taskPaneDropAt(x: number, y: number, width: number, height: number): TaskPaneDrop {
  const distances: [TaskPaneEdge, number][] = [["left", x / width], ["right", 1 - x / width], ["top", y / height], ["bottom", 1 - y / height]];
  const nearest = distances.reduce((best, item) => item[1] < best[1] ? item : best);
  return nearest[1] < 0.25 ? nearest[0] : "center";
}

export function taskPaneEdgeForArrow(key: string): TaskPaneEdge | null {
  switch (key) {
    case "ArrowLeft": return "left";
    case "ArrowRight": return "right";
    case "ArrowUp": return "top";
    case "ArrowDown": return "bottom";
    default: return null;
  }
}
