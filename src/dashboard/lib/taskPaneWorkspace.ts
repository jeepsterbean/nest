import { taskPaneIds, TASK_PANE_LIMIT, type TaskPaneLayout } from "./taskPaneLayout";
import type { SavedTaskViewState } from "./taskTableViews";

export const TASK_PANE_WORKSPACE_KEY = "nest:task-pane-workspace";
export type TaskPaneWorkspace = {
  layout: TaskPaneLayout;
  panes: { id: string; viewId: string; loadVersion?: number }[];
  activeId: string;
};

export function normalizeTaskPaneWorkspace(stored: unknown, saved: SavedTaskViewState): TaskPaneWorkspace {
  const fallback: TaskPaneWorkspace = { layout: { kind: "pane", id: "initial" }, panes: [{ id: "initial", viewId: saved.selectedId }], activeId: "initial" };
  if (!stored || typeof stored !== "object") return fallback;
  const input = stored as Record<string, unknown>;
  const ids = new Set<string>();
  const parseLayout = (value: unknown, depth: number): TaskPaneLayout | null => {
    if (!value || typeof value !== "object" || depth > 32 || ids.size >= TASK_PANE_LIMIT * 2) return null;
    const node = value as Record<string, unknown>;
    if (typeof node.id !== "string" || !node.id || ids.has(node.id)) return null;
    ids.add(node.id);
    if (node.kind === "pane") return { kind: "pane", id: node.id };
    if (node.kind !== "split" || (node.axis !== "horizontal" && node.axis !== "vertical")
      || typeof node.ratio !== "number" || !Number.isFinite(node.ratio) || node.ratio < 0.05 || node.ratio > 0.95) return null;
    const first = parseLayout(node.first, depth + 1);
    const second = parseLayout(node.second, depth + 1);
    return first && second ? { kind: "split", id: node.id, axis: node.axis, ratio: node.ratio, first, second } : null;
  };
  const layout = parseLayout(input.layout, 0);
  if (!layout || !Array.isArray(input.panes)) return fallback;
  const storedPanes: unknown[] = input.panes;
  const panes = taskPaneIds(layout).map(id => {
    const pane = storedPanes.find((value): value is { id: string; viewId: string } => Boolean(value && typeof value === "object"
      && "id" in value && value.id === id && "viewId" in value && typeof value.viewId === "string"));
    return { id, viewId: saved.views.some(view => view.id === pane?.viewId) ? pane!.viewId : saved.views[0]!.id };
  });
  return { layout, panes, activeId: typeof input.activeId === "string" && panes.some(pane => pane.id === input.activeId) ? input.activeId : panes[0]!.id };
}

export function readTaskPaneWorkspace(saved: SavedTaskViewState): TaskPaneWorkspace {
  try { return normalizeTaskPaneWorkspace(JSON.parse(localStorage.getItem(TASK_PANE_WORKSPACE_KEY) ?? "null"), saved); }
  catch { return normalizeTaskPaneWorkspace(null, saved); }
}
