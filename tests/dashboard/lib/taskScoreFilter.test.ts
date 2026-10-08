import { describe, expect, it } from "vitest";
import {
  matchingTaskScorePreset,
  normalizeScoreFilter,
  selectedTaskScores,
  taskMatchesScoreFilter,
  taskScoreFilterLabel,
  toggleTaskScoreFilter,
} from "../../../src/dashboard/lib/taskScoreFilter";

describe("taskScoreFilter", () => {
  it("treats All as no filter and None as unscored only", () => {
    expect(matchingTaskScorePreset(null)).toBe("all");
    expect(selectedTaskScores(null)).toEqual([1, 2, 3, 4, 5]);
    expect(selectedTaskScores({ kind: "none" })).toEqual([]);
    expect(taskMatchesScoreFilter(null, null)).toBe(true);
    expect(taskMatchesScoreFilter(3, null)).toBe(true);
    expect(matchingTaskScorePreset({ kind: "none" })).toBe("none");
    expect(taskMatchesScoreFilter(null, { kind: "none" })).toBe(true);
    expect(taskMatchesScoreFilter(3, { kind: "none" })).toBe(false);
    expect(taskScoreFilterLabel({ kind: "none" })).toBe("None");
  });

  it("ticks every score under All, and unchecking one leaves the rest", () => {
    expect(toggleTaskScoreFilter(null, 4)).toEqual({ kind: "scores", scores: [1, 2, 3, 5] });
    expect(toggleTaskScoreFilter({ kind: "none" }, 4)).toEqual({ kind: "scores", scores: [4] });
    expect(toggleTaskScoreFilter({ kind: "scores", scores: [4] }, 5)).toEqual({ kind: "scores", scores: [4, 5] });
    expect(toggleTaskScoreFilter({ kind: "scores", scores: [4] }, 4)).toBeNull();
    expect(matchingTaskScorePreset({ kind: "scores", scores: [4, 5] })).toBeNull();
    expect(taskMatchesScoreFilter(4, { kind: "scores", scores: [4, 5] })).toBe(true);
    expect(taskMatchesScoreFilter(null, { kind: "scores", scores: [4, 5] })).toBe(false);
    expect(taskScoreFilterLabel({ kind: "scores", scores: [4, 5] })).toBe("4, 5");
  });

  it("shortens labels with ranges and a single exclusion", () => {
    expect(taskScoreFilterLabel({ kind: "scores", scores: [3] })).toBe("3");
    expect(taskScoreFilterLabel({ kind: "scores", scores: [1, 2, 3] })).toBe("1–3");
    expect(taskScoreFilterLabel({ kind: "scores", scores: [2, 3, 4, 5] })).toBe("2–5");
    expect(taskScoreFilterLabel({ kind: "scores", scores: [1, 2, 4, 5] })).toBe("≠ 3");
    expect(taskScoreFilterLabel({ kind: "scores", scores: [1, 3, 5] })).toBe("1, 3, 5");
    expect(taskScoreFilterLabel({ kind: "scores", scores: [1, 2, 3, 5] })).toBe("≠ 4");
  });

  it("drops unknown stored scores", () => {
    expect(normalizeScoreFilter({ kind: "scores", scores: [4, 9, "5"] })).toEqual({ kind: "scores", scores: [4] });
    expect(normalizeScoreFilter({ kind: "none" })).toEqual({ kind: "none" });
    expect(normalizeScoreFilter({ kind: "scores", scores: [] })).toBeNull();
  });
});
