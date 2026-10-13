import { describe, expect, it } from "vitest";
import {
  buildScopeTree,
  normalizeTaskScope,
  scopeMatches,
  scopeSegments,
} from "../../../src/dashboard/lib/scope";
import type { Task } from "../../../src/lib/types";

const task = (id: number, scope: string | null): Task => ({
  id,
  title: `Task ${id}`,
  description: "",
  status: "active",
  workingNow: false,
  workedSeconds: 0,
  workStartedAt: null,
  scope,
  value: null,
  effort: null,
  parentTaskId: null,
  closedAt: null,
  followsTaskId: null,
  createdAt: id,
  updatedAt: id,
});

describe("normalizeTaskScope", () => {
  it("trims segments and joins with ' / '", () => {
    expect(normalizeTaskScope("  Work /  Project ")).toBe("Work / Project");
  });

  it("collapses blank segments", () => {
    expect(normalizeTaskScope("Work //  / Project")).toBe("Work / Project");
  });

  it("returns null for an all-blank scope", () => {
    expect(normalizeTaskScope("   /  / ")).toBeNull();
    expect(normalizeTaskScope("")).toBeNull();
  });

  it("keeps a single segment", () => {
    expect(normalizeTaskScope("Work")).toBe("Work");
  });
});

describe("scopeSegments", () => {
  it("splits, trims, and drops empties", () => {
    expect(scopeSegments(" Work / / Project ")).toEqual(["Work", "Project"]);
  });
});

describe("scopeMatches", () => {
  it("matches everything when no scope is selected", () => {
    expect(scopeMatches("Work", null)).toBe(true);
    expect(scopeMatches(null, null)).toBe(true);
  });

  it("matches exact equality", () => {
    expect(scopeMatches("Work", "Work")).toBe(true);
  });

  it("matches descendants via the ' / ' boundary", () => {
    expect(scopeMatches("Work / Project", "Work")).toBe(true);
  });

  it("does not match a sibling prefix without the separator", () => {
    expect(scopeMatches("Workshop", "Work")).toBe(false);
  });

  it("does not match a null task scope against a selected scope", () => {
    expect(scopeMatches(null, "Work")).toBe(false);
  });
});

describe("buildScopeTree", () => {
  it("accumulates counts up the ancestry", () => {
    const { byPath } = buildScopeTree([task(1, "A / B / C")]);
    expect(byPath.get("A")?.count).toBe(1);
    expect(byPath.get("A / B")?.count).toBe(1);
    expect(byPath.get("A / B / C")?.count).toBe(1);
  });

  it("sorts children by label", () => {
    const { roots } = buildScopeTree([task(1, "Zeta"), task(2, "Alpha")]);
    expect(roots.map((n) => n.label)).toEqual(["Alpha", "Zeta"]);
  });

  it("ignores tasks without a scope and resolves deep paths", () => {
    const { byPath, paths } = buildScopeTree([
      task(1, null),
      task(2, "A / B"),
    ]);
    expect(paths.has("A / B")).toBe(true);
    expect(byPath.get("A / B")?.depth).toBe(1);
    expect(byPath.get("A")?.children.map((n) => n.path)).toEqual(["A / B"]);
  });
});
