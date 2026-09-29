import { expect, it } from "vitest";
import type { BrainDump } from "../../../src/lib/types";
import { filterBrainDumpHistory, groupBrainDumpsByDay } from "../../../src/dashboard/lib/brainDumpHistory";

it("combines rolling day ranges and tags, newest first, including the range boundary", () => {
  const now = 1_800_000_000;
  const day = 86400;
  const dump = (id: number, age: number, tagged = true): BrainDump => ({
    id, createdAt: now - age * day, text: "A thought",
    tags: tagged ? [{ id: 4, name: "Personal" }] : [],
  });
  const dumps = [dump(1, 7), dump(2, 3), dump(3, 1), dump(4, 0, false), dump(5, 8), dump(6, -1)];
  const ids = (days: number, tag = "") =>
    filterBrainDumpHistory(dumps, days, tag, now * 1000).map((item) => item.id);
  expect(ids(1)).toEqual([4, 3]);
  expect(ids(3, "4")).toEqual([3, 2]);
  expect(ids(7)).toEqual([4, 3, 2, 1]);
  expect(ids(7, "99")).toEqual([]);
  expect(dumps.map((item) => item.id)).toEqual([1, 2, 3, 4, 5, 6]);
});

it("groups newest-first dumps by local day with Today and Yesterday labels", () => {
  const noon = new Date(2026, 8, 29, 12).getTime();
  const at = (id: number, dayOffset: number, hour: number): BrainDump => ({
    id, createdAt: new Date(2026, 8, 29 + dayOffset, hour).getTime() / 1000, text: "A thought", tags: [],
  });
  const days = groupBrainDumpsByDay([at(1, 0, 11), at(2, 0, 8), at(3, -1, 22), at(4, -3, 9)], noon);
  expect(days[0].label).toBe("Today");
  expect(days[1].label).toBe("Yesterday");
  expect(days[2].label).not.toMatch(/Today|Yesterday/);
  expect(days.map((day) => day.dumps.map((dump) => dump.id))).toEqual([[1, 2], [3], [4]]);
  expect(groupBrainDumpsByDay([], noon)).toEqual([]);
});
