import type { Task } from "../../lib/types";

export type ScopeNode = {
  path: string;
  label: string;
  depth: number;
  count: number;
  children: ScopeNode[];
};

export const normalizeTaskScope = (scope: string) => {
  const normalized = scope
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean)
    .join(" / ");
  return normalized || null;
};

export const scopeSegments = (scope: string) =>
  scope
    .split("/")
    .map((segment) => segment.trim())
    .filter(Boolean);

export const scopeMatches = (
  taskScope: string | null,
  selectedScope: string | null,
) =>
  selectedScope === null ||
  taskScope === selectedScope ||
  taskScope?.startsWith(`${selectedScope} /`) === true;

export const buildScopeTree = (taskList: Task[]) => {
  const roots: ScopeNode[] = [];
  const byPath = new Map<string, ScopeNode>();

  for (const task of taskList) {
    if (!task.scope) continue;
    const segments = scopeSegments(task.scope);
    let siblings = roots;
    let path = "";

    segments.forEach((label, index) => {
      path = path ? `${path} / ${label}` : label;
      let node = byPath.get(path);
      if (!node) {
        node = {
          path,
          label,
          depth: index,
          count: 0,
          children: [],
        };
        byPath.set(path, node);
        siblings.push(node);
      }
      node.count += 1;
      siblings = node.children;
    });
  }

  const sortNodes = (nodes: ScopeNode[]) => {
    nodes.sort((a, b) => a.label.localeCompare(b.label));
    for (const node of nodes) sortNodes(node.children);
  };
  sortNodes(roots);

  return { roots, byPath, paths: new Set(byPath.keys()) };
};

export type ScopeTree = ReturnType<typeof buildScopeTree>;
