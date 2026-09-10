import { expect, it } from "vitest";
import type { BrainDump } from "../../../src/lib/types";
import { filterBrainDumpHistory } from "../../../src/dashboard/lib/brainDumpHistory";

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
